import { Queue, Worker, Job } from 'bullmq';
import redis from '../redis.js';
import { GoogleGenAI } from '@google/genai';
import { updateJobStatus, refundVideoCredit, saveToLibrary } from '../lib/veoStudio/access.js';

const VEO_MODEL = 'veo-3.1-fast-generate-preview';
const POLL_INTERVAL_MS = 10_000;  // 10s between status checks
const MAX_POLLS = 36;             // 36 * 10s = 6 min timeout

export interface VeoJobData {
  uid: string;
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

async function pollOperation(ai: GoogleGenAI, operationName: string): Promise<string | null> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const op = await (ai as any).operations.get({ name: operationName });
      if (op.done) {
        const video = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
        if (video?.uri) return video.uri;
        return null;
      }
    } catch (e) {
      console.error('[VEO QUEUE] Poll error:', e);
    }
  }
  return null; // timeout
}

export const veoWorker = new Worker<VeoJobData>(
  'veo-generation',
  async (job: Job<VeoJobData>) => {
    const { uid, jobId, prompt, aspectRatio, imageBase64, outputType, style, operationName } = job.data;
    const genai = process.env.GEMINI_API_KEY;

    if (!genai) {
      console.error('[VEO QUEUE] GEMINI_API_KEY not set');
      await updateJobStatus(jobId, 'failed');
      await refundVideoCredit(uid);
      return;
    }

    const ai = new GoogleGenAI({ apiKey: genai });

    try {
      let outputUrl: string | null = null;

      if (outputType === 'image') {
        // Image generation via Imagen 3
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
        // Return base64 data URL (browser can render it directly)
        outputUrl = `data:image/png;base64,${b64}`;
      } else {
        // Video generation via Veo 3.1
        let op: any;

        if (imageBase64) {
          // Image-to-video
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
          // Text-to-video
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

        // Poll for completion
        const videoUri = await pollOperation(ai, op.name);
        if (!videoUri) {
          await updateJobStatus(jobId, 'failed');
          await refundVideoCredit(uid);
          return;
        }
        outputUrl = videoUri;
      }

      if (!outputUrl) throw new Error('No output URL');

      await updateJobStatus(jobId, 'completed', outputUrl);
      await saveToLibrary(uid, {
        outputUrl,
        outputType,
        prompt,
        style,
        jobId,
      });

      console.log(`[VEO QUEUE] Job ${jobId} completed for uid ${uid}`);
    } catch (err: any) {
      console.error(`[VEO QUEUE] Job ${jobId} failed:`, err.message);
      await updateJobStatus(jobId, 'failed');
      await refundVideoCredit(uid);
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
