import { describe, expect, it } from 'vitest';
import { describeFailure, failureReason } from './research-failure';

describe('research failure wording', () => {
    it('recognises the API\'s "LLM unavailable" message', () => {
        const error = 'AI analysis is temporarily unavailable. Please try again later.';
        expect(failureReason(error)).toBe('AI model unavailable — try again shortly');
        expect(describeFailure(error)).toMatch(/temporarily unavailable/);
    });

    it('recognises usage limits and timeouts', () => {
        expect(failureReason('429 quota exceeded')).toMatch(/Usage limit/);
        expect(failureReason('Request timed out after 120s')).toMatch(/Timed out/);
    });

    it('says nothing in a row when the reason is unknown, and stays general on the page', () => {
        expect(failureReason('TypeError: x is undefined')).toBeNull();
        expect(failureReason(undefined)).toBeNull();
        expect(describeFailure(undefined)).toMatch(/Something went wrong/);
    });
});
