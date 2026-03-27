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
export const verifyDomainDns = async (domain: string, expectedToken: string): Promise<boolean> => {
  const challengeDomain = `_vultintel-challenge.${domain}`;
  
  try {
    const resolver = dns.promises;
    console.log(`[DNS] Looking up TXT records for ${challengeDomain}`);
    
    // Set a short timeout for the lookup
    const records = await resolver.resolveTxt(challengeDomain);
    
    // records is an array of arrays, e.g., [['token1'], ['token2']]
    const flattenedRecords = records.flat();
    
    console.log(`[DNS] Found records for ${challengeDomain}:`, flattenedRecords);
    
    return flattenedRecords.includes(expectedToken);
  } catch (err: any) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
      console.log(`[DNS] No TXT records found for ${challengeDomain}`);
      return false;
    }
    console.error(`[DNS] Lookup failed for ${challengeDomain}:`, err.message);
    return false;
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
