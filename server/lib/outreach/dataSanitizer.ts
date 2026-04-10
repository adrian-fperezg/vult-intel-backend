/**
 * Cleans a contact name, enforcing Title Case and handling edge cases like hyphens.
 * e.g., "ADRIAN" -> "Adrian", "jean-luc" -> "Jean-Luc"
 */
export function cleanName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Split by spaces or hyphens, title case each part, then rejoin
  // Using a regex with a replacer function to handle boundaries
  return trimmed.toLowerCase().replace(/(?:^|[\s-])\w/g, function (match) {
    return match.toUpperCase();
  });
}

/**
 * Cleans a company name by removing formal legal suffixes so it sounds natural in an email.
 * e.g., "Acme Inc." -> "Acme", "Vult Intel LLC" -> "Vult Intel"
 */
export function cleanCompany(company?: string | null): string | null {
  if (!company) return null;
  let trimmed = company.trim();
  if (!trimmed) return null;

  // List of suffixes to strip. Note the word boundaries \b to avoid matching inside words
  const suffixes = [
    'inc\\.', 'inc', 'incorporated',
    'llc\\.', 'llc', 'l\\.l\\.c\\.',
    'corp\\.', 'corp', 'corporation',
    'ltd\\.', 'ltd', 'limited',
    'co\\.', 'co', 'company',
    's\\.a\\.', 's\\.a', 'sa',
    'pty', 'pty\\.', 'proprietary',
    'pvt', 'pvt\\.', 'private',
    'gmbh', 'ag', 'bv', 'nv',
    'plc\\.', 'plc'
  ];

  // Build a regex: (,? \b(inc|llc|...)\.?)+$ at the end of the string
  // Case insensitive
  const regexStr = `(?:[,\\s]+(?:${suffixes.join('|')})\\.?)*$`;
  const regex = new RegExp(regexStr, 'gi');

  trimmed = trimmed.replace(regex, '').trim();

  // If we accidentally stripped the whole string (e.g., if the company name was literally "Apple Inc." and we stripped it all? No, "Apple" remains. 
  // But if the company was literally "Inc." we'd strip it to empty). 
  // Fallback to original if stripping made it empty
  if (!trimmed) return company.trim();

  return trimmed;
}
