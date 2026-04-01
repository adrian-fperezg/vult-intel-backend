/**
 * Mock data used for email previews to simulate real-world sequence enrollments.
 */
const MOCK_DATA: Record<string, string> = {
  first_name: "Adrian",
  last_name: "Francisco",
  company_name: "Vult Intel",
  company: "Vult Intel",
  website: "vultintel.com",
  job_title: "Founder & CEO",
  city: "San Francisco",
  country: "USA",
  sender_name: "Vult Support",
  sender_company: "Vult Intel Corp",
};

/**
 * Replaces {{variable}} tags in a string or HTML content with mock data.
 * If a tag is not found in the mock data, it remains unchanged.
 * 
 * @param content The raw email text or HTML containing {{tags}}.
 * @returns The parsed content with mock values.
 */
export function parsePreviewVariables(content: string): string {
  if (!content) return "";

  // Regex to match {{variable}} or {{ variable }}
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, tag) => {
    const key = tag.trim().toLowerCase();
    
    // Check for direct match or common variations
    if (MOCK_DATA[key]) {
      return MOCK_DATA[key];
    }

    // Handle nested or complex tags if necessary (simple string replacement for now)
    return match;
  });
}
