// Freeze executable TypeScript states; Java tests consume data, not a second JS engine.
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const frontend = resolve(process.argv[2] ?? '../never-lift-frontend')
const output = resolve(backend, 'src/test/resources/physics/typescript-reference-2.0.2.json')
const { createServer } = await import(pathToFileURL(resolve(frontend, 'node_modules/vite/dist/node/index.js')).href)
const server = await createServer({ root: frontend, configFile: resolve(frontend, 'vite.config.ts'), server: { middlewareMode: true } })
try {
  const { PHYSICS_REFERENCE_SCENARIOS, runPhysicsReferenceScenario } = await server.ssrLoadModule('/src/race/physics-reference-runner.ts')
  const { resolveVehicleAgainstStaticColliders } = await server.ssrLoadModule('/src/race/collision.ts')
  const constants = JSON.parse(await readFile(resolve(frontend, 'contracts/module-2/v2/physics-constants.json'), 'utf8'))
  if (constants.version !== '2.0.2') throw new Error('Expected physics 2.0.2')
  const scenarios = PHYSICS_REFERENCE_SCENARIOS.map(scenario => {
    const states = []
    const barrier = scenario.environment?.barrier
    const wall = barrier && {
      id: `reference-${barrier.material}`, collisionMaterial: barrier.material,
      vertices: [barrier.from, barrier.to, { x: barrier.to.x + 0.4, y: barrier.to.y }, { x: barrier.from.x + 0.4, y: barrier.from.y }],
    }
    let lastImpactCount = 0
    runPhysicsReferenceScenario(scenario, { afterVehicleStep: ({ vehicle, step }) => {
      if (wall) resolveVehicleAgainstStaticColliders(vehicle, constants.simulation.physicsStepSeconds, () => [wall])
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
  const hashes = {}
  for (const file of ['src/race/vehicle-physics.ts', 'src/race/powertrain.ts', 'src/race/tire-model.ts', 'src/race/control-ramp.ts', 'src/race/math.ts', 'src/race/constants.ts', 'src/race/vehicle-geometry.ts', 'src/race/collision.ts', 'src/race/rigid-body-collision.ts', 'src/race/continuous-collision.ts', 'src/race/physics-reference-runner.ts', 'contracts/module-2/v2/physics-constants.json', 'contracts/module-2/v2/physics-reference-scenarios.json', 'contracts/module-2/v2/vehicle-definition.json']) {
    hashes[file] = createHash('sha256').update((await readFile(resolve(frontend, file), 'utf8')).replaceAll('\r\n', '\n')).digest('hex')
  }
  const contents = JSON.stringify({ physicsContractVersion: constants.version, sources: hashes, scenarios }, null, 2) + '\n'
  if (process.argv.includes('--check')) {
    if (await readFile(output, 'utf8') !== contents) throw new Error('TypeScript reference is stale')
    console.log(`Verified ${scenarios.length} executable TypeScript scenarios`)
  } else {
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, contents)
    console.log(`Recorded ${scenarios.length} executable TypeScript scenarios: ${output}`)
  }
} finally { await server.close() }
