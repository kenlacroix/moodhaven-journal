import { biometricToSpeed, healthSnapshotToSpeed } from './bioMapping';

describe('biometricToSpeed', () => {
  it('returns baseSpeed when ctx is null', () => {
    expect(biometricToSpeed(null, 1.0)).toBe(1.0);
    expect(biometricToSpeed(null, 1.5)).toBe(1.5);
  });

  describe('readinessScore only', () => {
    it('applies 0.85 multiplier for readiness >= 70', () => {
      expect(biometricToSpeed({ readinessScore: 85, stressSummary: null }, 1.0)).toBeCloseTo(0.85);
      expect(biometricToSpeed({ readinessScore: 70, stressSummary: null }, 1.0)).toBeCloseTo(0.85);
    });

    it('applies 1.0 multiplier for readiness 40–69', () => {
      expect(biometricToSpeed({ readinessScore: 55, stressSummary: null }, 1.0)).toBeCloseTo(1.0);
      expect(biometricToSpeed({ readinessScore: 40, stressSummary: null }, 1.0)).toBeCloseTo(1.0);
    });

    it('applies 1.2 multiplier for readiness < 40', () => {
      expect(biometricToSpeed({ readinessScore: 30, stressSummary: null }, 1.0)).toBeCloseTo(1.2);
    });

    it('handles null readinessScore gracefully', () => {
      expect(biometricToSpeed({ readinessScore: null, stressSummary: null }, 1.0)).toBeCloseTo(1.0);
    });
  });

  describe('stressSummary takes priority', () => {
    it('restored → 0.80 multiplier', () => {
      expect(biometricToSpeed({ readinessScore: 20, stressSummary: 'restored' }, 1.0)).toBeCloseTo(0.80);
    });

    it('normal → 1.00 multiplier', () => {
      expect(biometricToSpeed({ readinessScore: 20, stressSummary: 'normal' }, 1.0)).toBeCloseTo(1.0);
    });

    it('engaged → 1.10 multiplier', () => {
      expect(biometricToSpeed({ readinessScore: 90, stressSummary: 'engaged' }, 1.0)).toBeCloseTo(1.1);
    });

    it('stressful → 1.20 multiplier', () => {
      expect(biometricToSpeed({ readinessScore: 90, stressSummary: 'stressful' }, 1.0)).toBeCloseTo(1.2);
    });

    it('demanding → 1.25 multiplier', () => {
      expect(biometricToSpeed({ readinessScore: 90, stressSummary: 'demanding' }, 1.0)).toBeCloseTo(1.25);
    });
  });

  it('clamps result to [0.5, 2.0]', () => {
    // With baseSpeed=2.0 and demanding mult=1.25 → 2.5, clamped to 2.0
    expect(biometricToSpeed({ readinessScore: null, stressSummary: 'demanding' }, 2.0)).toBe(2.0);
    // With baseSpeed=0.5 and restored mult=0.80 → 0.4, clamped to 0.5
    expect(biometricToSpeed({ readinessScore: null, stressSummary: 'restored' }, 0.5)).toBe(0.5);
  });
});

describe('healthSnapshotToSpeed', () => {
  it('uses HRV when provided (highest priority)', () => {
    // hrvAvg >= 45 → mult 0.8
    expect(healthSnapshotToSpeed({ hrvAvg: 50 }, 1.0)).toBeCloseTo(0.8);
    // hrvAvg 25–44 → mult 1.0
    expect(healthSnapshotToSpeed({ hrvAvg: 35 }, 1.0)).toBeCloseTo(1.0);
    // hrvAvg < 25 → mult 1.3
    expect(healthSnapshotToSpeed({ hrvAvg: 20 }, 1.0)).toBeCloseTo(1.3);
  });

  it('falls back to readinessScore when hrvAvg is absent', () => {
    expect(healthSnapshotToSpeed({ readinessScore: 80 }, 1.0)).toBeCloseTo(0.85);
    expect(healthSnapshotToSpeed({ readinessScore: 55 }, 1.0)).toBeCloseTo(1.0);
    expect(healthSnapshotToSpeed({ readinessScore: 30 }, 1.0)).toBeCloseTo(1.2);
  });

  it('falls back to heartRate when neither hrv nor readiness is present', () => {
    // heartRate > 90 → mult 1.2
    expect(healthSnapshotToSpeed({ heartRate: 95 }, 1.0)).toBeCloseTo(1.2);
    // heartRate 70–90 → mult 1.0
    expect(healthSnapshotToSpeed({ heartRate: 75 }, 1.0)).toBeCloseTo(1.0);
    // heartRate < 70 → mult 0.85
    expect(healthSnapshotToSpeed({ heartRate: 60 }, 1.0)).toBeCloseTo(0.85);
  });

  it('returns baseSpeed when all fields absent', () => {
    expect(healthSnapshotToSpeed({}, 1.0)).toBe(1.0);
    expect(healthSnapshotToSpeed({}, 1.5)).toBe(1.5);
  });

  it('hrv priority beats readiness and heartRate together', () => {
    // HRV says fast (< 25 → 1.3), readiness says slow (>= 70 → 0.85) — HRV wins
    expect(healthSnapshotToSpeed({ hrvAvg: 15, readinessScore: 90, heartRate: 55 }, 1.0)).toBeCloseTo(1.3);
  });

  it('clamps result to [0.5, 2.0]', () => {
    expect(healthSnapshotToSpeed({ hrvAvg: 5 }, 2.0)).toBe(2.0);
    expect(healthSnapshotToSpeed({ hrvAvg: 60 }, 0.5)).toBe(0.5);
  });
});
