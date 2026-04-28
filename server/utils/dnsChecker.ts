import { resolveTxt } from 'dns/promises';

export interface DNSStatus {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

/**
 * Verifies DNS authentication records for a given domain.
 * SPF: TXT record on domain starting with v=spf1
 * DMARC: TXT record on _dmarc.domain starting with v=DMARC1
 * DKIM: TXT record on google._domainkey.domain (default for Google Workspace)
 */
export async function checkDNS(domain: string): Promise<DNSStatus> {
  const status: DNSStatus = {
    spf: false,
    dkim: false,
    dmarc: false,
  };

  try {
    // 1. SPF Check
    try {
      const spfRecords = await resolveTxt(domain);
      status.spf = spfRecords.some(records => 
        records.some(record => record.toLowerCase().startsWith('v=spf1'))
      );
    } catch (err) {
      console.warn(`[DNS] SPF check failed for ${domain}:`, err);
    }

    // 2. DMARC Check
    try {
      const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
      status.dmarc = dmarcRecords.some(records => 
        records.some(record => record.toUpperCase().startsWith('V=DMARC1'))
      );
    } catch (err) {
      console.warn(`[DNS] DMARC check failed for ${domain}:`, err);
    }

    // 3. DKIM Check (Google Default Selector)
    try {
      const dkimRecords = await resolveTxt(`google._domainkey.${domain}`);
      status.dkim = dkimRecords.some(records => 
        records.some(record => record.includes('v=DKIM1') || record.includes('k=rsa'))
      );
    } catch (err) {
      console.warn(`[DNS] DKIM check failed for ${domain}:`, err);
    }

  } catch (err) {
    console.error(`[DNS] Fatal DNS check error for ${domain}:`, err);
  }

  return status;
}
