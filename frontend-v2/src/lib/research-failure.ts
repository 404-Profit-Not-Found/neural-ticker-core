type FailureKind = 'unavailable' | 'limit' | 'timeout' | 'unknown';

function failureKind(error?: string | null): FailureKind {
    const text = (error || '').toLowerCase();
    if (/overload|unavailable|\b503\b|\b529\b/.test(text)) return 'unavailable';
    if (/rate limit|quota|\b429\b/.test(text)) return 'limit';
    if (/timeout|timed out|deadline/.test(text)) return 'timeout';
    return 'unknown';
}

/** What went wrong with a research run, in words a reader can act on. */
export function describeFailure(error?: string | null): string {
    switch (failureKind(error)) {
        case 'unavailable':
            return 'The AI model was temporarily unavailable, so this note was not written. Running it again in a few minutes usually works.';
        case 'limit':
            return 'The AI provider turned the request down because of a usage limit. Try again later.';
        case 'timeout':
            return 'The AI model took too long to answer and the run was stopped. Try again, or pick a faster model.';
        default:
            return 'Something went wrong while this note was being written, so there is nothing to show.';
    }
}

/** The same reason in a few words, for a list row. Null when nothing useful is known. */
export function failureReason(error?: string | null): string | null {
    switch (failureKind(error)) {
        case 'unavailable':
            return 'AI model unavailable — try again shortly';
        case 'limit':
            return 'Usage limit reached — try again later';
        case 'timeout':
            return 'Timed out — try a faster model';
        default:
            return null;
    }
}
