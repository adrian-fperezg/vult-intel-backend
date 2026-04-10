/**
 * Mock data used for email previews to simulate real-world sequence enrollments.
 */


/**
 * Replaces {{variable}} tags in a string or HTML content with recipient data or fallback mock data.
 * If a tag is not found in either, it remains unchanged.
 * 
 * @param content The raw email text or HTML containing {{tags}}.
 * @param recipientData Optional real recipient data to use for replacements.
 * @returns The parsed content with appropriate values.
 */
export function parsePreviewVariables(content: string, recipientData?: Record<string, any>): string {
  if (!content) return "";

  // Normalize recipient data keys for matching
  const normalizedRecipient: Record<string, any> = {};
  if (recipientData) {
    Object.entries(recipientData).forEach(([key, value]) => {
      normalizedRecipient[key.toLowerCase()] = value;
    });
    // Add common aliases for contact data
    if (recipientData.company) normalizedRecipient.company_name = recipientData.company;
    if (recipientData.first_name) normalizedRecipient.name = recipientData.first_name;
  }

  // Regex to match {{variable}} or {{ variable }}
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, tag) => {
    const key = tag.trim().toLowerCase();
    
    // 1. Try real recipient data first
    if (normalizedRecipient[key] !== undefined && normalizedRecipient[key] !== null) {
      return String(normalizedRecipient[key]);
    }

    // 2. Fallback to common variations for recipient data
    if (key === 'company' && normalizedRecipient['company_name']) return String(normalizedRecipient['company_name']);
    if (key === 'company_name' && normalizedRecipient['company']) return String(normalizedRecipient['company']);



    // 4. Special handling for {{signature}}
    if (key === 'signature') {
      return normalizedRecipient.signature || "";
    }

    // Handle nested or complex tags if necessary (simple string replacement for now)
    return match;
  });
}
