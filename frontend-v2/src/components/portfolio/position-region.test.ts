import { describe, it, expect } from 'vitest';
import { positionRegion } from './position-region';

describe('positionRegion', () => {
    it('treats bare symbols and one-letter US share classes as US', () => {
        expect(positionRegion('AAPL')).toBe('US');
        expect(positionRegion('BRK.B')).toBe('US');
        // Venue codes inside an ordinary symbol must not make it European.
        expect(positionRegion('COIN')).toBe('US');
        expect(positionRegion('SMCI')).toBe('US');
    });

    it('reads European venues from the exchange suffix', () => {
        expect(positionRegion('ASML.AS')).toBe('EU');
        expect(positionRegion('SHEL.L')).toBe('EU');
        expect(positionRegion('sap.de')).toBe('EU');
        expect(positionRegion('VOLV-B.ST')).toBe('EU');
    });

    it('is neither for other venues and never throws on empty input', () => {
        expect(positionRegion('7203.T')).toBe('OTHER'); // Tokyo: a known venue, not EU
        expect(positionRegion('BHP.AX')).toBe('OTHER');
        expect(positionRegion('')).toBe('US');
        expect(positionRegion(undefined)).toBe('US');
    });
});
