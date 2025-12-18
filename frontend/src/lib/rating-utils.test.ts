import { describe, it, expect } from 'vitest';
import { calculateAiRating } from './rating-utils';

describe('calculateAiRating', () => {
    it('should return Speculative Buy for high risk, extreme upside', () => {
        const result = calculateAiRating(8.5, 120);
        expect(result.rating).toBe('Speculative Buy');
        expect(result.variant).toBe('speculativeBuy');
    });

    it('should return Speculative Buy for high risk, high overall score', () => {
        const result = calculateAiRating(8.0, 50, 7.8);
        expect(result.rating).toBe('Speculative Buy');
        expect(result.variant).toBe('speculativeBuy');
    });

    it('should return Sell for high risk, low upside and low overall score', () => {
        const result = calculateAiRating(8.5, 20, 5.0);
        expect(result.rating).toBe('Sell');
        expect(result.variant).toBe('sell');
    });

    it('should return Sell for negative upside', () => {
        const result = calculateAiRating(5.0, -10);
        expect(result.rating).toBe('Sell');
        expect(result.variant).toBe('sell');
    });

    it('should return Strong Buy for low risk, high upside', () => {
        const result = calculateAiRating(4.0, 25);
        expect(result.rating).toBe('Strong Buy');
        expect(result.variant).toBe('strongBuy');
    });

    it('should return Buy for moderate risk, moderate upside', () => {
        const result = calculateAiRating(6.5, 15);
        expect(result.rating).toBe('Buy');
        expect(result.variant).toBe('buy');
    });

    it('should return Hold by default', () => {
        const result = calculateAiRating(5.0, 5);
        expect(result.rating).toBe('Hold');
        expect(result.variant).toBe('hold');
    });
});
