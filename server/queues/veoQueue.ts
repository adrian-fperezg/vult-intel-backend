import { Queue, Worker, Job } from 'bullmq';
import redis from '../redis.js';
import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { updateJobStatus, refundVideoCredit, saveToLibrary } from '../lib/veoStudio/access.js';

const VEO_MODEL = 'veo-3.1-fast-generate-preview';
const POLL_INTERVAL_MS = 10_000;  // 10s between status checks
const MAX_POLLS = 36;             // 36 * 10s = 6 min timeout

export interface VeoJobData {
  uid: string;
  projectId: string;
  jobId: string;
  prompt: string;
  aspectRatio?: string;
  imageBase64?: string;
  outputType: 'video' | 'image';
  style?: string;
  operationName?: string; // for polling Veo operation
}

export const veoQueue = new Queue<VeoJobData>('veo-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 100,
  }
});

/**
 * Polls Vertex AI operation status via directed REST API call.
 * Bypasses the broken SDK Operations.get() logic.
 */
async function pollOperationREST(operationName: string): Promise<{ outputUrl?: string; error?: string }> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
  }

  const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    projectId: creds.project_id,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  // Ensure the URL is correctly constructed
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${operationName}`;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken.token}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VEO QUEUE] REST Poll error (${response.status}):`, errorText);
        continue; // Keep polling if it's a temporary error
      }

      const operation = await response.json() as any;
      
      if (operation.done) {
        if (operation.error) {
          console.error('[VEO VERTEX ERROR RESPONSE]:', JSON.stringify(operation, null, 2));
          return { error: operation.error.message || 'Operation failed' };
        }

        // Vertex AI / Veo predictions structure
        const videoBytes = operation.response?.predictions?.[0]?.bytesBase64Encoded;
        if (videoBytes) {
          console.log(`[VEO QUEUE] Operation ${operationName} finished successfully.`);
          return { outputUrl: `data:video/mp4;base64,${videoBytes}` };
        }

        // Fallback for different GenAI response structures
        const videoUri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (videoUri) return { outputUrl: videoUri };

        console.error(`[VEO QUEUE] Operation done but no video data found in response:`, JSON.stringify(operation.response));
        return { error: 'No video data found in response' };
      }

      console.log(`[VEO QUEUE] Operation ${operationName} still pending (${i + 1}/${MAX_POLLS})...`);
    } catch (e: any) {
      console.error('[VEO VERTEX FETCH ERROR]:', e);
    }
  }

  console.error(`[VEO QUEUE] Polling timeout for ${operationName} after ${MAX_POLLS} attempts.`);
  return { error: 'Polling timeout' };
}

export const veoWorker = new Worker<VeoJobData>(
  'veo-generation',
  async (job: Job<VeoJobData>) => {
    const { uid, projectId, jobId, prompt, aspectRatio, imageBase64, outputType, style } = job.data;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('[VEO QUEUE] GEMINI_API_KEY not set');
      await updateJobStatus(jobId, 'failed');
      await refundVideoCredit(uid);
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
      let outputUrl: string | null = null;

      if (outputType === 'image') {
        const res = await (ai as any).models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: aspectRatio || '16:9',
            outputMimeType: 'image/png',
          }
        });
        const b64 = res.generatedImages?.[0]?.image?.imageBytes;
        if (!b64) throw new Error('No image bytes returned');
        outputUrl = `data:image/png;base64,${b64}`;
      } else {
        // Video generation via Veo 3.1
        let op: any;

        if (imageBase64) {
          const mimeType = imageBase64.startsWith('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/jpeg';
          const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

          op = await (ai as any).models.generateVideos({
            model: VEO_MODEL,
            prompt,
            image: {
              imageBytes: base64Data,
              mimeType,
            },
            config: {
              aspectRatio: aspectRatio || '16:9',
              numberOfVideos: 1,
            },
          });
        } else {
          op = await (ai as any).models.generateVideos({
            model: VEO_MODEL,
            prompt,
            config: {
              aspectRatio: aspectRatio || '16:9',
              numberOfVideos: 1,
              durationSeconds: 8,
            },
          });
        }

        if (!op?.name) {
          throw new Error('Failed to start video generation: No operation name returned');
        }

        console.log(`[VEO QUEUE] Started job ${jobId} (Operation: ${op.name})`);

        // Poll for completion via REST
        const pollResult = await pollOperationREST(op.name);
        
        if (pollResult.error) {
          throw new Error(pollResult.error);
        }
        outputUrl = pollResult.outputUrl || null;
      }

      if (!outputUrl) throw new Error('No output URL generated');

      await updateJobStatus(jobId, 'completed', outputUrl);
      await saveToLibrary(uid, projectId, {
        outputUrl,
        outputType,
        prompt,
        style,
        jobId,
      });

      console.log(`[VEO QUEUE] Job ${jobId} completed successfully for uid ${uid}`);
    } catch (err: any) {
      console.error(`[VEO QUEUE] Job ${jobId} execution error:`, err.message);
      await updateJobStatus(jobId, 'failed', undefined, err.message);
      // Only refund if it was a video job (image jobs don't consume video credits)
      if (outputType === 'video') {
        await refundVideoCredit(uid);
      }
    }
  },
  { connection: redis, concurrency: 2 }
);

veoWorker.on('completed', job => {
  console.log(`[VEO QUEUE] Worker completed job: ${job.id}`);
});
veoWorker.on('failed', (job, err) => {
  console.error(`[VEO QUEUE] Worker failed job ${job?.id}:`, err.message);
});
