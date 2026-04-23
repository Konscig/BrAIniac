import { upsertCoverage } from '../../data/axis_coverage.service.js';
import type { MPrimeResult } from './m_prime_builder.service.js';

export async function persistAxisCoverage(assessmentId: number, mprime: MPrimeResult) {
  const allAxes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  for (const axis of allAxes) {
    const count = mprime.axis_presence[axis] ?? 0;
    const mandatory = mprime.mandatory_axes.includes(axis);
    await upsertCoverage({
      fk_assessment_id: assessmentId,
      axis,
      mandatory,
      covered: count > 0,
      metric_count: count,
    });
  }
}
