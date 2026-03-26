import db from "../../db.js";
import { decryptToken } from "./encrypt.js";
import { getZeroBounceCredits } from "./zerobounce.js";
import { emailVerifier as verifyWithHunter } from "./hunter.js";

/**
 * Waterfall verification logic:
 * 1. Try ZeroBounce if configured and has credits.
 * 2. Fall back to Hunter.io.
 */
export async function verifyEmailWaterfall(email: string, projectId: string, userId: string): Promise<{ status: string; provider: string }> {
  // 1. Get outreach settings
  const settings = await db.prepare("SELECT zerobounce_api_key, hunter_api_key FROM outreach_settings WHERE project_id = ?").get(projectId) as any;
  
  const zbKey = settings?.zerobounce_api_key ? decryptToken(settings.zerobounce_api_key) : null;
  const hunterKey = settings?.hunter_api_key ? decryptToken(settings.hunter_api_key) : null;

  // --- Step 1: ZeroBounce ---
  if (zbKey) {
    try {
      const balance = await getZeroBounceCredits(zbKey);
      if (balance.credits && balance.credits > 0) {
        const url = `https://api.zerobounce.net/v2/validate?api_key=${zbKey}&email=${encodeURIComponent(email)}&ip_address=`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.error) {
          let status = 'unknown';
          if (data.status === 'valid') status = 'valid';
          else if (data.status === 'invalid' || data.status === 'spamtrap') status = 'invalid';
          else if (data.status === 'catch-all') status = 'catch_all';
          else if (data.status === 'do_not_mail') status = 'invalid';
          
          return { status, provider: 'zerobounce' };
        }
      }
    } catch (err: any) {
      console.error('[Waterfall] ZeroBounce failed, falling back to Hunter:', err.message);
    }
  }

  // --- Step 2: Hunter.io ---
  if (hunterKey) {
    try {
      const data = await verifyWithHunter(projectId, userId, email);
      
      let status = 'unknown';
      if (data.status === 'valid') status = 'valid';
      else if (data.status === 'invalid') status = 'invalid';
      else if (data.status === 'accept_all') status = 'catch_all';
      else if (data.status === 'webmail') status = 'valid'; // Hunter often returns webmail for valid results
      
      return { status, provider: 'hunter' };
    } catch (err: any) {
      console.error('[Waterfall] Hunter failed:', err.message);
    }
  }

  return { status: 'unknown', provider: 'none' };
}
