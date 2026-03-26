import PDLJS from 'peopledatalabs';
import crypto from 'crypto';

interface PersonLead {
  id: string;
  type: 'person';
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  title: string;
  department: string;
  seniority: string;
  confidence: number;
  company: string;
  domain: string;
  industry: string;
  companySize: string;
  country: string;
  city: string;
  linkedinUrl: string;
  twitter: string;
  phone: string;
  technologies: string[];
  source: 'pdl' | 'hunter';
  selected: boolean;
  status: 'new' | 'saved' | 'enrolled';
}

function getPDLClient() {
  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) throw new Error('PDL_API_KEY not configured');
  return new PDLJS({ apiKey });
}

export async function searchPDL(projectId: string, params: {
  domain: string;
  department?: string;
  seniority?: string;
  limit?: number;
}): Promise<PersonLead[]> {
  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) return [];

  try {
    const client = getPDLClient();

    const esQuery: any = {
      bool: {
        must: [
          { term: { 'job_company_website': params.domain } },
        ],
      },
    };

    if (params.seniority) {
      // Map common seniority levels to PDL levels if needed
      esQuery.bool.must.push({ term: { 'job_title_levels': params.seniority.toLowerCase() } });
    }

    const response = await client.person.search.elastic({
      searchQuery: esQuery,
      size: params.limit || 10,
      dataset: 'resume',
    });

    if (!response.data || response.data.length === 0) return [];

    return response.data.map((p: any) => ({
      id: crypto.randomUUID(),
      type: 'person' as const,
      firstName: p.first_name || '',
      lastName: p.last_name || '',
      fullName: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' '),
      email: p.work_email || p.emails?.[0]?.address || '',
      title: p.job_title || '',
      department: p.job_title_role || params.department || '',
      seniority: p.job_title_levels?.[0] || '',
      confidence: 85, // PDL data is generally high quality
      company: p.job_company_name || '',
      domain: params.domain,
      industry: p.industry || '',
      companySize: p.job_company_employee_count?.toString() || '',
      country: p.location_country || '',
      city: p.location_locality || '',
      linkedinUrl: p.linkedin_url || '',
      twitter: p.twitter_url || '',
      phone: p.mobile_phone || p.phone_numbers?.[0] || '',
      technologies: [],
      source: 'pdl' as const,
      selected: true,
      status: 'new' as const,
    }));
  } catch (err: any) {
    console.error(`[PDL Service] Error:`, err.message);
    return [];
  }
}

/**
 * Fetches real-time usage (credits) from Peopledatalabs V5 API.
 */
export async function getPDLUsage(apiKey?: string) {
  const finalKey = apiKey || process.env.PDL_API_KEY;
  if (!finalKey) return { error: 'PDL_API_KEY not configured' };

  try {
    const res = await fetch(`https://api.peopledatalabs.com/v5/usage?api_key=${finalKey}`);
    const data = await res.json();
    
    // PDL /usage returns { "available": ..., "used": ..., "remaining": ... }
    if (res.ok) {
      return {
        available: data.available || 0,
        used: data.used || 0,
        remaining: data.remaining || 0
      };
    }
    return { error: data.message || 'PDL Usage API error' };
  } catch (err: any) {
    console.error('[PDL Service] Usage Error:', err.message);
    return { error: 'Failed to connect to PDL Usage API' };
  }
}
