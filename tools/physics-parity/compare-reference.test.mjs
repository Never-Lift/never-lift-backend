import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { compareReferenceScenarios } from './compare-reference.mjs'

const contract = JSON.parse(readFileSync(new URL('../../contracts/module-2/v2/physics-reference-scenarios.json', import.meta.url)))
const expected = [{ id: 'example', states: [{ step: 1, state: { x: 1, angle: 0, frontWheelAngularSpeed: 0, gear: 1, damageState: { health: 100 } } }] }]
const compare = actual => compareReferenceScenarios(expected, actual, contract)

test('accepts identical data and equivalent wrapped orientation', () => {
  const actual = structuredClone(expected)
  actual[0].states[0].state.angle = Math.PI * 2
  assert.equal(compare(expected).failures.length, 0)
  assert.equal(compare(actual).failures.length, 0)
})

test('uses the original metric and wheel tolerances, not a generic numeric epsilon', () => {
  for (const [field, difference] of [['x', 0.031], ['angle', 0.004], ['frontWheelAngularSpeed', 0.051], ['gear', 1]]) {
    const actual = structuredClone(expected)
    actual[0].states[0].state[field] += difference
    assert.equal(compare(actual).failures[0].field, field)
  }
})

test('rejects missing/extra scenarios, states, fields and non-finite values', () => {
  assert.notEqual(compare([]).failures.length, 0)
  assert.notEqual(compare([...expected, ...expected]).failures.length, 0)
  for (const mutate of [
    value => value[0].states.pop(),
    value => { value[0].id = 'other' },
    value => { value[0].states[0].step = 2 },
    value => { delete value[0].states[0].state.x },
    value => { value[0].states[0].state.extra = 1 },
    value => { value[0].states[0].state.x = Number.NaN },
    value => { value[0].states[0].state.damageState.health = 99 },
  ]) {
    const actual = structuredClone(expected)
    mutate(actual)
    assert.notEqual(compare(actual).failures.length, 0)
  }
})
