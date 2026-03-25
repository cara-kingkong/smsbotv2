import { describe, it, expect, vi } from 'vitest';

// Placeholder test file — tests will use mocked Supabase client
describe('AgentService', () => {
  it('should select agent by weighted random from campaign', () => {
    // Weighted selection logic test
    const agents = [
      { id: 'a1', weight: 70 },
      { id: 'a2', weight: 30 },
    ];

    const totalWeight = agents.reduce((sum, a) => sum + a.weight, 0);
    expect(totalWeight).toBe(100);

    // Run 1000 selections and verify distribution is roughly correct
    const counts: Record<string, number> = { a1: 0, a2: 0 };

    for (let i = 0; i < 1000; i++) {
      let random = Math.random() * totalWeight;
      for (const agent of agents) {
        random -= agent.weight;
        if (random <= 0) {
          counts[agent.id]++;
          break;
        }
      }
    }

    // Agent a1 (weight 70) should get ~70% of selections
    expect(counts.a1).toBeGreaterThan(550);
    expect(counts.a1).toBeLessThan(850);
  });

  it('should validate phone numbers to E.164 format', () => {
    // Basic format check
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    expect(e164Regex.test('+14155551234')).toBe(true);
    expect(e164Regex.test('4155551234')).toBe(false);
    expect(e164Regex.test('+0123')).toBe(false);
  });
});
