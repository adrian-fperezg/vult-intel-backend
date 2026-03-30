import admin, { initializeFirebase } from '../firebase.js';

// Ensure Firebase Admin is initialized before requiring Firestore
function getFirestore() {
  initializeFirebase();
  return admin.firestore();
}

const ADDON_KEY = 'veo_studio_pack';
const MONTHLY_LIMIT = 32;
const FOUNDER_EMAILS = (process.env.FOUNDER_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isFounderEmail(email: string): boolean {
  return FOUNDER_EMAILS.includes(email.toLowerCase());
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  videosUsed: number;
  videosLimit: number;
  periodResetAt: string | null;
  isFounder?: boolean;
  status?: string;
}

/**
 * Check if a user has an active Veo Studio Pack subscription and available credits.
 * Priority check: Founder bypass using verified email from Auth token.
 */
export async function checkVeoStudioAccess(uid: string, email?: string): Promise<AccessResult> {
  const FOUNDER_EMAIL = 'adrianfperezg@gmail.com';
  
  if (email === FOUNDER_EMAIL || (email && isFounderEmail(email))) {
    return { 
      allowed: true, 
      status: 'active',
      videosUsed: 0, 
      videosLimit: 9999, // Represents 'Unlimited' in the UI
      isFounder: true, 
      periodResetAt: null 
    };
  }

  const db = getFirestore();
  const customerRef = db.collection('customers').doc(uid);
  const snap = await customerRef.get();

  if (!snap.exists) {
    return { allowed: false, reason: 'no_subscription', videosUsed: 0, videosLimit: MONTHLY_LIMIT, periodResetAt: null };
  }

  const data = snap.data() ?? {};
  const addonData = data?.addons?.[ADDON_KEY];

  // Check Stripe extension writes subscription data here
  // Also support direct activeAddons array (set by webhook or extension)
  const hasAddon =
    addonData?.status === 'active' ||
    (Array.isArray(data.activeAddons) && data.activeAddons.includes(ADDON_KEY));

  if (!hasAddon) {
    return { allowed: false, reason: 'no_subscription', videosUsed: 0, videosLimit: MONTHLY_LIMIT, periodResetAt: null };
  }

  // Check credit usage for current period
  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const veoUsage = data?.veoUsage ?? {};
  const videosUsed = veoUsage[periodKey] ?? 0;
  const videosLimit = MONTHLY_LIMIT;

  // Period resets on first day of next month
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const periodResetAt = nextMonth.toISOString();

  if (videosUsed >= videosLimit) {
    return {
      allowed: false,
      reason: 'credits_exhausted',
      videosUsed,
      videosLimit,
      periodResetAt,
    };
  }

  return { allowed: true, videosUsed, videosLimit, periodResetAt };
}

/**
 * Atomically increment video usage count for the current billing period.
 */
export async function incrementVideoCount(uid: string): Promise<void> {
  const db = getFirestore();
  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await db.collection('customers').doc(uid).set(
    { veoUsage: { [periodKey]: admin.firestore.FieldValue.increment(1) } },
    { merge: true }
  );
}

/**
 * Refund a video credit on job failure.
 */
export async function refundVideoCredit(uid: string): Promise<void> {
  const db = getFirestore();
  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await db.collection('customers').doc(uid).set(
    { veoUsage: { [periodKey]: admin.firestore.FieldValue.increment(-1) } },
    { merge: true }
  );
}

/**
 * Save a completed generation to the user's library in Firestore.
 */
export async function saveToLibrary(
  uid: string,
  projectId: string,
  asset: {
    outputUrl: string;
    outputType: 'video' | 'image';
    prompt: string;
    style?: string;
    jobId: string;
  }
): Promise<string> {
  const db = getFirestore();
  const docRef = await db.collection('veo_library').add({
    uid,
    projectId,
    ...asset,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Get the user's library assets for a specific project.
 */
export async function getLibraryAssets(uid: string, projectId: string): Promise<any[]> {
  const db = getFirestore();
  const snap = await db.collection('veo_library')
    .where('uid', '==', uid)
    .where('projectId', '==', projectId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate().toISOString() }));
}

/**
 * Delete a library asset.
 */
export async function deleteLibraryAsset(uid: string, assetId: string): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection('veo_library').doc(assetId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== uid) return false;
  await ref.delete();
  return true;
}

/**
 * Create a generation job document in Firestore with project scoping.
 */
export async function createJobDoc(uid: string, projectId: string, jobId: string, prompt: string): Promise<void> {
  const db = getFirestore();
  await db.collection('veo_jobs').doc(jobId).set({
    uid,
    projectId,
    prompt,
    status: 'processing',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Update a generation job status.
 */
export async function updateJobStatus(
  jobId: string,
  status: 'processing' | 'completed' | 'failed',
  outputUrl?: string
): Promise<void> {
  const db = getFirestore();
  const update: Record<string, any> = { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (outputUrl) update.outputUrl = outputUrl;
  await db.collection('veo_jobs').doc(jobId).update(update);
}

/**
 * Get a job's current status.
 */
export async function getJobStatus(jobId: string): Promise<{ status: string; outputUrl?: string } | null> {
  const db = getFirestore();
  const snap = await db.collection('veo_jobs').doc(jobId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { status: d.status, outputUrl: d.outputUrl };
}

/**
 * Get/save Brand Kit (scoped to project).
 */
export async function getBrandKit(uid: string, projectId: string): Promise<any | null> {
  const db = getFirestore();
  // We use a compound key or just project as the doc ID since project IDs are unique
  const snap = await db.collection('veo_brand_kits').doc(`${uid}:${projectId}`).get();
  return snap.exists ? snap.data() : null;
}

export async function saveBrandKit(uid: string, projectId: string, kit: any): Promise<void> {
  const db = getFirestore();
  await db.collection('veo_brand_kits').doc(`${uid}:${projectId}`).set(
    { ...kit, uid, projectId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}
