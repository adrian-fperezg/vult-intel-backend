/**
 * ============================================================================
 * IMMUTABLE ARCHITECTURAL BOUNDARY: SNIPPET PARSER
 * ============================================================================
 * WARNING: Do NOT modify this file to add ad-hoc snippet replacements for 
 * specific UI components or features. This file is the SINGLE SOURCE OF TRUTH 
 * for parsing and replacing all {{variables}} and {{snippets}} across the 
 * application (both frontend and backend).
 * 
 * Any changes to snippet logic MUST happen here and MUST remain pure and 
 * decoupled from specific UI concerns or backend database calls.
 * ============================================================================
 */

export interface SnippetParserContext {
  variables?: Record<string, any>;
  snippets?: Record<string, any>;
  fallbackMode?: 'empty' | 'space' | 'mock' | 'leave';
}

/**
 * A pure, regex-based engine for parsing and replacing variables and snippets.
 * @param content The HTML or plain text string containing {{tags}}.
 * @param context The variable and snippet datasets to interpolate.
 * @returns The parsed string with all valid tags replaced.
 */
export function parseSnippets(content: string, context: SnippetParserContext): string {
  if (!content) return "";

  const { variables = {}, snippets = {}, fallbackMode = 'empty' } = context;

  // Normalize variables object to lowercase keys for case-insensitive matching
  const normVariables: Record<string, any> = {};
  Object.entries(variables).forEach(([k, v]) => {
    normVariables[k.toLowerCase()] = v;
  });

  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match: string, tag: string) => {
    const key = tag.trim().toLowerCase();

    // 1. Signature & Snippets Resolution
    // For exact match on "signature" or specific "sig_*" tags
    if (key.startsWith('sig_') || key === 'signature') {
      const snippetContent = snippets[key] || snippets[tag] || snippets[tag.trim()];
      if (snippetContent) {
        let sanitized = String(snippetContent);
        
        // Ensure proper HTML structure for signatures:
        // Replace <p> with <div> to remove default vertical margins
        sanitized = sanitized.replace(/<p>/gi, '<div style="margin: 0; padding: 0;">');
        sanitized = sanitized.replace(/<\/p>/gi, '</div>');

        // Convert raw newlines to single <br> tags
        sanitized = sanitized.replace(/\r?\n/g, '<br>');

        // Collapse multiple consecutive <br> tags into a single <br>
        sanitized = sanitized.replace(/(<br\s*\/?>){2,}/gi, '<br>');

        // Wrap signature in a normalized div
        return `<div style="margin: 0; padding: 0; line-height: 1.2;">${sanitized}</div>`;
      }
      
      // Unresolved signature returns empty string to avoid showing raw tags
      return '';
    }

    // 2. Standard Variable Interpolation
    if (normVariables[key] !== undefined && normVariables[key] !== null && normVariables[key] !== "") {
      return String(normVariables[key]);
    }

    // 3. Fallback Handling for unresolved variables
    switch (fallbackMode) {
      case 'mock':
        return `[${key}]`;
      case 'space':
        return ' ';
      case 'leave':
        return match;
      case 'empty':
      default:
        return '';
    }
  });
}
