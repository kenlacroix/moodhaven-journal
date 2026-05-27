import type { OuraHealthContext, OuraStressSummary } from '../../../types/oura';
import type { HealthSnapshotPayload } from '../../../types/signals';

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

// Maps a live watch health_snapshot to a bilateral engine speed.
// Used by useStillBioFeedback during an active session.
// Priority: HRV > readiness > heartRate (most to least informative).
export function healthSnapshotToSpeed(
  snapshot: Pick<HealthSnapshotPayload, 'hrvAvg' | 'readinessScore' | 'heartRate'>,
  baseSpeed = 1.0,
): number {
  let mult = 1.0;

  if (snapshot.hrvAvg !== undefined) {
    if (snapshot.hrvAvg >= 45) mult = 0.8;
    else if (snapshot.hrvAvg >= 25) mult = 1.0;
    else mult = 1.3;
  } else if (snapshot.readinessScore !== undefined) {
    if (snapshot.readinessScore >= 70) mult = 0.85;
    else if (snapshot.readinessScore >= 40) mult = 1.0;
    else mult = 1.2;
  } else if (snapshot.heartRate !== undefined) {
    if (snapshot.heartRate > 90) mult = 1.2;
    else if (snapshot.heartRate >= 70) mult = 1.0;
    else mult = 0.85;
  }

  return Math.min(2.0, Math.max(0.5, baseSpeed * mult));
}
