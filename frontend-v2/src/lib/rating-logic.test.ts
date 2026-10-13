
import { describe, it, expect } from 'vitest';
import { calculateLiveUpside, getBasePriceFromScenarios } from './rating-utils';

describe('Rating Logic Verification', () => {
  it('should prioritize Live Price vs Base Scenario if available', () => {
    const currentPrice = 100;
    const scenarios = [{ scenario_type: 'Base', price_mid: 150 }];
    const backendUpside = 0; // Ignore this if scenario exists

    const basePrice = getBasePriceFromScenarios(scenarios);
    const upside = calculateLiveUpside(currentPrice, basePrice, backendUpside);

    expect(basePrice).toBe(150);
    expect(upside).toBe(50); // (150-100)/100 = 50%
  });

  it('should fall back to backend upside if Scenarios are missing', () => {
    const currentPrice = 100;
    const scenarios: Array<{ scenario_type: string; price_mid: number }> = [];
    const backendUpside = 300.4; // From screenshot

    const basePrice = getBasePriceFromScenarios(scenarios);
    const upside = calculateLiveUpside(currentPrice, basePrice, backendUpside);

    expect(basePrice).toBeNull();
    expect(upside).toBe(300.4);
  });

  it('should fall back to backend upside if Base Scenario is missing', () => {
    const currentPrice = 100;
    const scenarios = [{ scenario_type: 'Bear', price_mid: 50 }];
    const backendUpside = 25.5;

    const basePrice = getBasePriceFromScenarios(scenarios);
    const upside = calculateLiveUpside(currentPrice, basePrice, backendUpside);

    expect(basePrice).toBeNull();
    expect(upside).toBe(25.5);
  });

  it('should return 0 absolute fallback', () => {
    const currentPrice = 100;
    const scenarios = null;
    const backendUpside = null;

    const basePrice = getBasePriceFromScenarios(scenarios);
    const upside = calculateLiveUpside(currentPrice, basePrice, backendUpside);

    expect(upside).toBe(0);
  });
});
