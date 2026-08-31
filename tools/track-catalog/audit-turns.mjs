import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// This is a geometry heuristic for locating review anchors, not an official
// turn map. Always confirm numbering and direction against the circuit's
// referenced FIA/official material before editing an environment profile.
process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0)
  throw error
})

const turnCounts = {
  'albert-park': 14,
  shanghai: 16,
  suzuka: 18,
  bahrain: 15,
  jeddah: 27,
  miami: 19,
  montreal: 14,
  monaco: 19,
  barcelona: 14,
  spielberg: 10,
  silverstone: 18,
  'spa-francorchamps': 19,
  hungaroring: 14,
  zandvoort: 14,
  monza: 11,
  madrid: 22,
  baku: 20,
  singapore: 19,
  austin: 20,
  'mexico-city': 17,
  interlagos: 15,
  'las-vegas': 17,
  lusail: 16,
  'yas-marina': 16,
}

const trackDirectory = resolve(
  import.meta.dirname,
  '..',
  '..',
  'contracts',
  'module-2',
  'v1',
  'tracks',
)

function normalizeAngle(angle) {
  let result = angle
  while (result > Math.PI) result -= Math.PI * 2
  while (result < -Math.PI) result += Math.PI * 2
  return result
}

function sample(path, distanceMeters, lengthMeters) {
  const normalized = ((distanceMeters % lengthMeters) + lengthMeters) % lengthMeters
  let index = 1
  while (index < path.length && path[index].distanceMeters < normalized) index += 1
  const to = path[Math.min(index, path.length - 1)]
  const from = path[Math.max(0, index - 1)]
  const span = Math.max(0.001, to.distanceMeters - from.distanceMeters)
  const alpha = Math.max(0, Math.min(1, (normalized - from.distanceMeters) / span))
  return {
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
  }
}

function curvatureAt(track, distanceMeters) {
  const before = sample(track.centerline, distanceMeters - 35, track.lengthMeters)
  const current = sample(track.centerline, distanceMeters, track.lengthMeters)
  const after = sample(track.centerline, distanceMeters + 35, track.lengthMeters)
  const incoming = Math.atan2(current.y - before.y, current.x - before.x)
  const outgoing = Math.atan2(after.y - current.y, after.x - current.x)
  return normalizeAngle(outgoing - incoming)
}

function detectTurns(track, expectedCount) {
  const candidates = []
  for (let distanceMeters = 0; distanceMeters < track.lengthMeters; distanceMeters += 10) {
    const signedCurvature = curvatureAt(track, distanceMeters)
    candidates.push({
      distanceMeters,
      fraction: distanceMeters / track.lengthMeters,
      signedCurvature,
      score: Math.abs(signedCurvature),
    })
  }

  const selected = []
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const overlaps = selected.some((turn) => {
      const direct = Math.abs(turn.distanceMeters - candidate.distanceMeters)
      const wrapped = track.lengthMeters - direct
      return Math.min(direct, wrapped) < 55
    })
    if (!overlaps) selected.push(candidate)
    if (selected.length === expectedCount) break
  }
  return selected.sort((a, b) => a.distanceMeters - b.distanceMeters)
}

for (const [trackId, turnCount] of Object.entries(turnCounts)) {
  const track = JSON.parse(
    await readFile(resolve(trackDirectory, `${trackId}.json`), 'utf8'),
  )
  console.log(`\n${trackId} (${track.lengthMeters} m) — heuristic anchors`)
  for (const [index, turn] of detectTurns(track, turnCount).entries()) {
    const direction = turn.signedCurvature >= 0 ? 'left' : 'right'
    console.log(
      `A${String(index + 1).padStart(2, '0')} ${String(turn.distanceMeters).padStart(4)} m  ${(turn.fraction).toFixed(4)}  ${direction}`,
    )
  }
}
