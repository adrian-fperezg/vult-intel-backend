/**
 * Robustly extracts and parses the first JSON object found in a string.
 * This handles cases where the AI might include markdown backticks or preamble/postamble text.
 */
export function safeJsonParse<T = any>(text: string): T {
    try {
        // 1. Try a direct parse (fastest)
        return JSON.parse(text.trim());
    } catch (e) {
        // 2. Try to find the first '{' and the last '}'
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');

        if (startIdx === -1 || endIdx === -1) {
            throw new Error(`Could not find any JSON object in AI response. Raw text: ${text.substring(0, 100)}...`);
        }

        const potentialJson = text.substring(startIdx, endIdx + 1);

        try {
            return JSON.parse(potentialJson);
        } catch (innerError: any) {
            // 3. If that still fails (maybe multiple objects?), try to find the matching brace for the first '{'
            // This is more expensive but robust.
            let braceCount = 0;
            let foundFirst = false;
            let capturedJson = "";

            for (let i = startIdx; i < text.length; i++) {
                const char = text[i];
                if (char === '{') {
                    braceCount++;
                    foundFirst = true;
                } else if (char === '}') {
                    braceCount--;
                }

                if (foundFirst) {
                    capturedJson += char;
                    if (braceCount === 0) {
                        break;
                    }
                }
            }

            try {
                return JSON.parse(capturedJson);
            } catch (deepError) {
                // If all fails, throw original or a more descriptive error
                console.error("Failed to parse JSON even with robust extraction. Raw text:", text);
                throw new Error(`AI returned invalid JSON: ${innerError.message}`);
            }
        }
    }
}
