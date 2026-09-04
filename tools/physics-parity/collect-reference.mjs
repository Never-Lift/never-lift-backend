/** Runs the real TS engine. Kept closure-free so the same collector runs in browsers. */
export function collectReferenceScenarios({
  scenarios,
  runScenario,
  resolveBarriers,
  stepSeconds,
}) {
  return scenarios.map(scenario => {
    const states = []
    const barrier = scenario.environment?.barrier
    const wall = barrier && {
      id: `reference-${barrier.material}`, collisionMaterial: barrier.material,
      vertices: [barrier.from, barrier.to, { x: barrier.to.x + 0.4, y: barrier.to.y }, { x: barrier.from.x + 0.4, y: barrier.from.y }],
    }
    let lastImpactCount = 0
    runScenario(scenario, { afterVehicleStep: ({ vehicle, step }) => {
      if (wall) resolveBarriers(vehicle, stepSeconds, () => [wall])
      if (step < 15 || (step + 1) % 60 === 0 || step === scenario.steps - 1 || vehicle.damage.impactCount !== lastImpactCount) {
        const state = { x: vehicle.position.x, y: vehicle.position.y, velocityX: vehicle.velocity.x, velocityY: vehicle.velocity.y, angle: vehicle.angle }
        for (const key of ['yawRate', 'steeringAngle', 'appliedThrottle', 'appliedBrake', 'frontWheelAngularSpeed', 'rearWheelAngularSpeed', 'gear', 'engineRpm', 'gearShiftTimeRemaining', 'longitudinalAcceleration']) state[key] = vehicle.physicsState[key]
        state.damageState = { ...vehicle.damage }
        states.push({ step: step + 1, state })
      }
      lastImpactCount = vehicle.damage.impactCount
    } })
    return { id: scenario.id, states }
  })
}
