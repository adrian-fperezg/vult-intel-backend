import dns from 'dns';
import crypto from 'crypto';

/**
 * Generates a unique verification token for domain lookup
 */
export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Verifies if a domain has the expected TXT record
 * Expected record: _vultintel-challenge.domain IN TXT "token"
 */
export const verifyDomainDns = async (domain: string, expectedToken: string): Promise<{ success: boolean; error?: string }> => {
  // Clean domain and build challenge host
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase().trim();
  const challengeHost = `_vultintel-challenge.${cleanDomain}`;
  
  try {
    const resolver = dns.promises;
    console.log(`[DNS] Looking up TXT records for ${challengeHost}`);
    
    // Set a short timeout for the lookup (default Node.js behavior is fine for now)
    const records = await resolver.resolveTxt(challengeHost);
    
    // records is an array of arrays, e.g., [['token1'], ['token2']]
    const flattenedRecords = records.flat().map(r => r.trim());
    
    console.log(`[DNS] Found records for ${challengeHost}:`, flattenedRecords);
    
    if (flattenedRecords.includes(expectedToken.trim())) {
      return { success: true };
    }
    
    return { 
      success: false, 
      error: flattenedRecords.length > 0 
        ? `TXT record found for ${challengeHost} but token mismatch. Make sure it matches exactly: ${expectedToken}` 
        : `No TXT records found for ${challengeHost}.` 
    };
  } catch (err: any) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
      console.log(`[DNS] No TXT records found for ${challengeHost}`);
      return { success: false, error: `DNS verification failed. No TXT record found for ${challengeHost}.` };
    }
    console.error(`[DNS] Lookup failed for ${challengeHost}:`, err.message);
    return { success: false, error: `DNS lookup failed: ${err.message}` };
  }
};

/**
 * Helper to extract domain from an email address
 */
export const extractDomain = (email: string): string => {
  const parts = email.split('@');
  if (parts.length !== 2) return '';
  return parts[1].toLowerCase();
};
