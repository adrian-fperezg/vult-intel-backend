import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Robustly initializes Firebase Admin SDK.
 * Supports stringified JSON credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON
 * (used in Railway/Production) or falls back to Application Default Credentials.
 */
export function initializeFirebase() {
  if (admin.apps.length > 0) return admin;

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

  try {
    if (credentialsJson) {
      const serviceAccount = JSON.parse(credentialsJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
      console.log('[FIREBASE] Successfully initialized with GOOGLE_APPLICATION_CREDENTIALS_JSON');
    } else {
      admin.initializeApp({
        projectId: projectId,
      });
      console.log('[FIREBASE] Initialized with local VITE_FIREBASE_PROJECT_ID (Bypassing JSON credentials)');
    }
  } catch (err: any) {
    console.error('[FIREBASE] Critical Initialization Error:', err.message);
    // last ditch fallback to avoid crashing startup if possible
    if (!admin.apps.length) {
      admin.initializeApp({ projectId });
    }
  }

  return admin;
}

export default admin;
