/**
 * Fetches real-time credit balance from ZeroBounce API.
 * 
 * @param apiKey - ZeroBounce API Key
 * @returns Object with credits or error
 */
export async function getZeroBounceCredits(apiKey: string) {
  if (!apiKey) return { error: 'No API key provided' };
  
  try {
    const res = await fetch(`https://api.zerobounce.net/v2/getcredits?api_key=${apiKey}`);
    const data = await res.json();
    
    if (res.ok && data.Credits !== undefined) {
      return { credits: parseInt(data.Credits, 10) || 0 };
    }
    return { error: data.message || 'Unknown ZeroBounce error' };
  } catch (err: any) {
    console.error('[ZeroBounce API] Error fetching credits:', err.message);
    return { error: 'Failed to connect to ZeroBounce API' };
  }
}
