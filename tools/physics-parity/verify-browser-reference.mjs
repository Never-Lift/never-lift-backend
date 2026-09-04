// Read-only acceptance probe: it never writes or regenerates a golden reference.
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium, firefox, webkit } from 'playwright'
import { collectReferenceScenarios } from './collect-reference.mjs'
import { compareReferenceScenarios } from './compare-reference.mjs'
import { requireReferenceRuntime } from './reference-support.mjs'

requireReferenceRuntime()
const { values } = parseArgs({ options: { frontend: { type: 'string' }, browsers: { type: 'string', default: 'chromium' } } })
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const frontend = resolve(values.frontend ?? resolve(backend, '../never-lift-frontend'))
const names = values.browsers.split(',')
const browserTypes = { chromium, chrome: chromium, msedge: chromium, firefox, webkit }
for (const name of names) if (!browserTypes[name]) throw new Error(`Unsupported browser: ${name}`)
const reference = JSON.parse(await readFile(resolve(backend, 'src/test/resources/physics/typescript-reference-2.0.3.json'), 'utf8'))
const contract = JSON.parse(await readFile(resolve(frontend, 'contracts/module-2/v2/physics-reference-scenarios.json'), 'utf8'))
const { createServer } = await import(pathToFileURL(resolve(frontend, 'node_modules/vite/dist/node/index.js')).href)
const server = await createServer({ root: frontend, configFile: resolve(frontend, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'physics-probe-only',
  configureServer(vite) {
    vite.middlewares.use('/__physics_probe', (_request, response) => {
      response.setHeader('Content-Type', 'text/html')
      response.end('<!doctype html><title>Never Lift physics verification</title>')
    })
  },
}] })

try {
  await server.listen()
  const address = server.httpServer.address()
  for (const name of names) {
    const browser = await browserTypes[name].launch({ headless: true, ...(['chrome', 'msedge'].includes(name) ? { channel: name } : {}) })
    try {
      const page = await browser.newPage()
      // No app shell, authentication, production API, or existing browser profile is used.
      await page.goto(`http://127.0.0.1:${address.port}/__physics_probe`)
      const result = await page.evaluate(async collector => {
        const { PHYSICS_REFERENCE_SCENARIOS, runPhysicsReferenceScenario } = await import('/src/race/physics-reference-runner.ts')
        const { resolveVehicleAgainstStaticColliders } = await import('/src/race/collision.ts')
        const { PHYSICS_CONSTANTS } = await import('/src/race/constants.ts')
        const collect = new Function(`return (${collector})`)()
        return {
          version: PHYSICS_CONSTANTS.version,
          scenarios: collect({ scenarios: PHYSICS_REFERENCE_SCENARIOS, runScenario: runPhysicsReferenceScenario, resolveBarriers: resolveVehicleAgainstStaticColliders, stepSeconds: PHYSICS_CONSTANTS.simulation.physicsStepSeconds }),
        }
      }, collectReferenceScenarios.toString())
      const { failures, maxima } = compareReferenceScenarios(reference.scenarios, result.scenarios, contract)
      const versionMatches = result.version === reference.physicsContractVersion
      console.log(JSON.stringify({ browser: name, version: browser.version(), physicsContractVersion: result.version, versionMatches, scenarios: result.scenarios.length, states: result.scenarios.reduce((total, scenario) => total + scenario.states.length, 0), passed: versionMatches && failures.length === 0, failureCount: failures.length, maxima, firstFailures: failures.slice(0, 8) }, null, 2))
      if (!versionMatches || failures.length) process.exitCode = 1
    } finally { await browser.close() }
  }
} finally { await server.close() }
