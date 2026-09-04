// Diagnostic only: compare platform transcendental functions before changing physics.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
const reference = JSON.parse(await readFile('src/test/resources/physics/typescript-reference-2.0.3.json', 'utf8'))
const probes = []
for (const scenario of reference.scenarios) for (const { state } of scenario.states) {
  const values = [state.angle, state.yawRate, state.longitudinalAcceleration, state.frontWheelAngularSpeed / 100]
  for (const value of values) for (const name of ['sin', 'cos', 'tanh']) probes.push({ name, a: value, b: 0, value: Math[name](value) })
  probes.push({ name: 'pow', a: Math.abs(state.longitudinalAcceleration) + 0.001, b: 0.9, value: Math.abs(state.longitudinalAcceleration + 0) + 0.001 })
  probes[probes.length - 1].value = Math.pow(probes[probes.length - 1].a, 0.9)
  probes.push({ name: 'atan2', a: state.velocityY, b: state.velocityX, value: Math.atan2(state.velocityY, state.velocityX) })
}
await mkdir('target', { recursive: true })
await writeFile('target/math-probes.json', JSON.stringify(probes))
console.log(`${probes.length} math probes`)
