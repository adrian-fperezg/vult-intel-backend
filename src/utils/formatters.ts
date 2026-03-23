/**
 * Formats a number of tokens into a readable string.
 * Handles Million (M), Thousand (K), and absolute values.
 */
export function formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toLocaleString();
}

/**
 * Formats a percentage safely.
 */
export function formatPercent(percent: number): string {
    return `${Math.round(percent)}%`;
}
