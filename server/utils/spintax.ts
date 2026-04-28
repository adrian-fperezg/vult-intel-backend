/**
 * Parses Spintax formatted text: {option1|option2|option3}
 * Randomly selects one of the options and replaces the bracketed text.
 * Handles multiple blocks and nesting by processing from the inside out.
 * 
 * Example: "Hello {there|friend}, {how are you|hope you're {well|great}}."
 * Possible result: "Hello friend, hope you're great."
 * 
 * @param text The string containing Spintax patterns.
 * @returns A string with Spintax blocks resolved.
 */
export function parseSpintax(text: string): string {
  if (!text) return "";
  
  let result = text;
  // Regex matches the innermost { ... } blocks that don't contain other brackets
  const spintaxRegex = /\{([^{}]+)\}/g;
  
  // Continue replacing as long as there are matches
  // Using a loop ensures we handle nested blocks from the inside out
  while (result.includes('{') && result.includes('}')) {
    const nextResult = result.replace(spintaxRegex, (match, options) => {
      const choices = options.split('|');
      const randomChoice = choices[Math.floor(Math.random() * choices.length)];
      return randomChoice;
    });
    
    // If no changes were made (e.g., malformed brackets), break to avoid infinite loop
    if (nextResult === result) break;
    result = nextResult;
  }
  
  return result;
}
