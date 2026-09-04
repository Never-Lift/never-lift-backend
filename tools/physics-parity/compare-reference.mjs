import { isDeepStrictEqual } from 'node:util'

/** Mirrors VehicleIntegratorTest tolerances; rejects missing/extra data as well. */
export function compareReferenceScenarios(expected, actual, contract) {
  const tolerance = contract.tolerance
  const fieldTolerance = {
    x: tolerance.positionMeters, y: tolerance.positionMeters,
    velocityX: tolerance.velocityMetersPerSecond, velocityY: tolerance.velocityMetersPerSecond,
    angle: tolerance.angleRadians, yawRate: tolerance.angleRadians, steeringAngle: tolerance.angleRadians,
    frontWheelAngularSpeed: tolerance.wheelRadiansPerSecond,
    rearWheelAngularSpeed: tolerance.wheelRadiansPerSecond,
    engineRpm: tolerance.engineRpm,
    gearShiftTimeRemaining: contract.physicsStepSeconds + Number.EPSILON,
    longitudinalAcceleration: tolerance.velocityMetersPerSecond,
  }
  const failures = []
  const maxima = {}
  if (expected.length !== actual.length) failures.push({ reason: 'scenario-count' })
  for (let index = 0; index < expected.length; index++) {
    const reference = expected[index], candidate = actual[index]
    if (!candidate || candidate.id !== reference.id || candidate.states.length !== reference.states.length) {
      failures.push({ scenario: reference.id, reason: 'scenario-or-state-count' })
      continue
    }
    for (let i = 0; i < reference.states.length; i++) {
      const recorded = reference.states[i], observed = candidate.states[i]
      if (recorded.step !== observed.step || !isDeepStrictEqual(Object.keys(recorded.state).sort(), Object.keys(observed.state).sort())) {
        failures.push({ scenario: reference.id, step: recorded.step, reason: 'state-shape' })
        continue
      }
      for (const [field, value] of Object.entries(recorded.state)) {
        const actualValue = observed.state[field]
        if (field === 'damageState') {
          if (!isDeepStrictEqual(value, actualValue)) failures.push({ scenario: reference.id, step: recorded.step, field })
          continue
        }
        const limit = fieldTolerance[field] ?? Number.EPSILON
        let delta = actualValue - value
        if (field === 'angle') {
          delta %= Math.PI * 2
          if (delta > Math.PI) delta -= Math.PI * 2
          if (delta < -Math.PI) delta += Math.PI * 2
        }
        delta = Math.abs(delta)
        maxima[field] = Math.max(maxima[field] ?? 0, delta)
        if (!Number.isFinite(actualValue) || !Number.isFinite(value) || delta > limit) {
          failures.push({ scenario: reference.id, step: recorded.step, field, delta, limit })
        }
      }
    }
  }
  return { failures, maxima }
}
