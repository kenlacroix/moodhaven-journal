import type { OuraHealthContext, OuraStressSummary } from '../../../types/oura';

function stressToMultiplier(summary: OuraStressSummary): number {
  switch (summary) {
    case 'restored': return 0.80;
    case 'normal': return 1.00;
    case 'engaged': return 1.10;
    case 'stressful': return 1.20;
    case 'demanding': return 1.25;
  }
}

// Maps Oura biometric state to a bilateral engine speed multiplier.
// Higher stress / lower readiness → faster pace (engages the settling response).
// High readiness / restored → gentler pace (gentle reinforcement for an already-calm system).
// Priority: stressSummary > readinessScore (more specific signal wins).
export function biometricToSpeed(
  ctx: Pick<OuraHealthContext, 'readinessScore' | 'stressSummary'> | null,
  baseSpeed = 1.0,
): number {
  if (!ctx) return baseSpeed;

  let mult = 1.0;

  if (ctx.readinessScore !== null) {
    if (ctx.readinessScore >= 70) mult = 0.85;
    else if (ctx.readinessScore >= 40) mult = 1.0;
    else mult = 1.2;
  }

  if (ctx.stressSummary !== null) {
    mult = stressToMultiplier(ctx.stressSummary);
  }

  return Math.min(2.0, Math.max(0.5, baseSpeed * mult));
}
