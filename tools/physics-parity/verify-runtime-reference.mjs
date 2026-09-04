// Read-only check on another supported Node runtime; never refreezes the oracle.
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { collectReferenceScenarios } from './collect-reference.mjs'
import { compareReferenceScenarios } from './compare-reference.mjs'

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const frontend = resolve(process.argv[2] ?? resolve(backend, '../never-lift-frontend'))
const reference = JSON.parse(await readFile(resolve(backend, 'src/test/resources/physics/typescript-reference-2.0.3.json'), 'utf8'))
const contract = JSON.parse(await readFile(resolve(frontend, 'contracts/module-2/v2/physics-reference-scenarios.json'), 'utf8'))
const { createServer } = await import(pathToFileURL(resolve(frontend, 'node_modules/vite/dist/node/index.js')).href)
const server = await createServer({ root: frontend, configFile: resolve(frontend, 'vite.config.ts'), server: { middlewareMode: true } })
try {
  const { PHYSICS_REFERENCE_SCENARIOS, runPhysicsReferenceScenario } = await server.ssrLoadModule('/src/race/physics-reference-runner.ts')
  const { resolveVehicleAgainstStaticColliders } = await server.ssrLoadModule('/src/race/collision.ts')
  const { PHYSICS_CONSTANTS } = await server.ssrLoadModule('/src/race/constants.ts')
  const scenarios = collectReferenceScenarios({ scenarios: PHYSICS_REFERENCE_SCENARIOS, runScenario: runPhysicsReferenceScenario, resolveBarriers: resolveVehicleAgainstStaticColliders, stepSeconds: PHYSICS_CONSTANTS.simulation.physicsStepSeconds })
  const { failures, maxima } = compareReferenceScenarios(reference.scenarios, scenarios, contract)
  const versionMatches = PHYSICS_CONSTANTS.version === reference.physicsContractVersion
  console.log(JSON.stringify({ node: process.versions.node, physicsContractVersion: PHYSICS_CONSTANTS.version, scenarios: scenarios.length, states: scenarios.reduce((total, scenario) => total + scenario.states.length, 0), passed: versionMatches && !failures.length, failureCount: failures.length, maxima, firstFailures: failures.slice(0, 8) }, null, 2))
  if (!versionMatches || failures.length) process.exitCode = 1
} finally { await server.close() }
