import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..', '..')
const contractDirectory = resolve(repositoryRoot, 'contracts', 'module-2', 'v1')
const sourcePath = resolve(contractDirectory, 'source', 'f1-circuits-2026.geojson')
const catalogPath = resolve(contractDirectory, 'catalog.json')
const checkOnly = process.argv.includes('--check')

const EARTH_RADIUS_METERS = 6_371_008.8
const SAMPLE_INTERVAL_METERS = 20
const CHUNK_LENGTH_METERS = 250
const CATALOG_VERSION = '2026.1'

const trackSpecs = [
  ['albert-park', 'Albert Park Circuit', 1, 'AU', 'Australia', 'Melbourne', 'park', 7],
  ['shanghai', 'Shanghai International Circuit', 2, 'CN', 'China', 'Shanghai', 'classic', 7.5],
  ['suzuka', 'Suzuka International Racing Course', 3, 'JP', 'Japan', 'Suzuka', 'classic', 7],
  ['bahrain', 'Bahrain International Circuit', 4, 'BH', 'Bahrain', 'Sakhir', 'desert', 7.5],
  ['jeddah', 'Jeddah Corniche Circuit', 5, 'SA', 'Saudi Arabia', 'Jeddah', 'coastal', 6.5],
  ['miami', 'Miami International Autodrome', 6, 'US', 'United States', 'Miami', 'street', 7],
  ['montreal', 'Circuit Gilles-Villeneuve', 7, 'CA', 'Canada', 'Montreal', 'park', 6.5],
  ['monaco', 'Circuit de Monaco', 8, 'MC', 'Monaco', 'Monaco', 'coastal', 6],
  ['barcelona', 'Circuit de Barcelona-Catalunya', 9, 'ES', 'Spain', 'Barcelona', 'classic', 7.5],
  ['spielberg', 'Red Bull Ring', 10, 'AT', 'Austria', 'Spielberg', 'classic', 7.5],
  ['silverstone', 'Silverstone Circuit', 11, 'GB', 'United Kingdom', 'Silverstone', 'classic', 8],
  ['spa-francorchamps', 'Circuit de Spa-Francorchamps', 12, 'BE', 'Belgium', 'Spa-Francorchamps', 'classic', 7.5],
  ['hungaroring', 'Hungaroring', 13, 'HU', 'Hungary', 'Budapest', 'classic', 7],
  ['zandvoort', 'Circuit Zandvoort', 14, 'NL', 'Netherlands', 'Zandvoort', 'coastal', 7],
  ['monza', 'Autodromo Nazionale Monza', 15, 'IT', 'Italy', 'Monza', 'park', 7.5],
  ['madrid', 'Circuito de Madring', 16, 'ES', 'Spain', 'Madrid', 'street', 7],
  ['baku', 'Baku City Circuit', 17, 'AZ', 'Azerbaijan', 'Baku', 'street', 6.5],
  ['singapore', 'Marina Bay Street Circuit', 18, 'SG', 'Singapore', 'Singapore', 'night-city', 6.5],
  ['austin', 'Circuit of the Americas', 19, 'US', 'United States', 'Austin', 'classic', 7.5],
  ['mexico-city', 'Autódromo Hermanos Rodríguez', 20, 'MX', 'Mexico', 'Mexico City', 'classic', 7],
  ['interlagos', 'Autódromo José Carlos Pace - Interlagos', 21, 'BR', 'Brazil', 'São Paulo', 'classic', 7],
  ['las-vegas', 'Las Vegas Street Circuit', 22, 'US', 'United States', 'Las Vegas', 'night-city', 7],
  ['lusail', 'Losail International Circuit', 23, 'QA', 'Qatar', 'Lusail', 'desert', 7.5],
  ['yas-marina', 'Yas Marina Circuit', 24, 'AE', 'United Arab Emirates', 'Abu Dhabi', 'coastal', 7.5],
].map(([id, sourceName, round, countryCode, countryName, locality, sceneryPreset, halfWidthMeters]) => ({
  id,
  sourceName,
  round,
  countryCode,
  countryName,
  locality,
  sceneryPreset,
  halfWidthMeters,
}))

const round = (value, decimals = 3) => Number(value.toFixed(decimals))
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

function normalize(vector) {
  const magnitude = Math.hypot(vector.x, vector.y)
  if (magnitude === 0) return { x: 1, y: 0 }
  return { x: vector.x / magnitude, y: vector.y / magnitude }
}

function projectCoordinates(coordinates, expectedLengthMeters) {
  const [originLongitude, originLatitude] = coordinates[0]
  const originLatitudeRadians = originLatitude * Math.PI / 180
  const rawPoints = coordinates.map(([longitude, latitude]) => ({
    x: EARTH_RADIUS_METERS * (longitude - originLongitude) * Math.PI / 180 * Math.cos(originLatitudeRadians),
    y: EARTH_RADIUS_METERS * (latitude - originLatitude) * Math.PI / 180,
  }))

  if (distance(rawPoints[0], rawPoints.at(-1)) < 2) rawPoints.pop()

  const rawLength = closedLength(rawPoints)
  const scale = expectedLengthMeters / rawLength
  return rawPoints.map((point) => ({ x: point.x * scale, y: point.y * scale }))
}

function closedLength(points) {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    total += distance(points[index], points[(index + 1) % points.length])
  }
  return total
}

function resampleClosedPath(points, expectedLengthMeters, halfWidthMeters) {
  const segments = []
  let accumulated = 0
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const length = distance(start, end)
    segments.push({ start, end, from: accumulated, to: accumulated + length, length })
    accumulated += length
  }

  const sampleCount = Math.max(20, Math.ceil(expectedLengthMeters / SAMPLE_INTERVAL_METERS))
  const samples = []
  for (let index = 0; index <= sampleCount; index += 1) {
    const targetDistance = index === sampleCount ? accumulated : accumulated * index / sampleCount
    const segment = segments.find((candidate) => targetDistance <= candidate.to + 1e-9) ?? segments.at(-1)
    const ratio = segment.length === 0 ? 0 : (targetDistance - segment.from) / segment.length
    samples.push({
      x: round(segment.start.x + (segment.end.x - segment.start.x) * ratio),
      y: round(segment.start.y + (segment.end.y - segment.start.y) * ratio),
      distanceMeters: round(expectedLengthMeters * index / sampleCount),
      halfWidthMeters,
    })
  }

  samples[samples.length - 1] = { ...samples[0], distanceMeters: expectedLengthMeters }
  return samples
}

function sampleAtDistance(centerline, targetDistance, lengthMeters) {
  const normalizedDistance = ((targetDistance % lengthMeters) + lengthMeters) % lengthMeters
  const nextIndex = centerline.findIndex((point) => point.distanceMeters >= normalizedDistance)
  const endIndex = nextIndex <= 0 ? 1 : nextIndex
  const start = centerline[endIndex - 1]
  const end = centerline[endIndex]
  const segmentLength = end.distanceMeters - start.distanceMeters
  const ratio = segmentLength === 0 ? 0 : (normalizedDistance - start.distanceMeters) / segmentLength
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
    halfWidthMeters: start.halfWidthMeters + (end.halfWidthMeters - start.halfWidthMeters) * ratio,
  }
}

function tangentAtDistance(centerline, targetDistance, lengthMeters) {
  const before = sampleAtDistance(centerline, targetDistance - 2, lengthMeters)
  const after = sampleAtDistance(centerline, targetDistance + 2, lengthMeters)
  return normalize({ x: after.x - before.x, y: after.y - before.y })
}

function vector(point) {
  return { x: round(point.x), y: round(point.y) }
}

function gateAtDistance(index, centerline, distanceMeters, lengthMeters) {
  const point = sampleAtDistance(centerline, distanceMeters, lengthMeters)
  const tangent = tangentAtDistance(centerline, distanceMeters, lengthMeters)
  return {
    index,
    distanceMeters: round(distanceMeters),
    position: vector(point),
    forward: vector(tangent),
    halfWidthMeters: round(point.halfWidthMeters + 2),
  }
}

function createRacingLine(centerline) {
  const lastUniqueIndex = centerline.length - 2
  return centerline.map((point, index) => {
    const uniqueIndex = index === centerline.length - 1 ? 0 : index
    const previous = centerline[(uniqueIndex - 2 + lastUniqueIndex + 1) % (lastUniqueIndex + 1)]
    const next = centerline[(uniqueIndex + 2) % (lastUniqueIndex + 1)]
    const incoming = normalize({ x: point.x - previous.x, y: point.y - previous.y })
    const outgoing = normalize({ x: next.x - point.x, y: next.y - point.y })
    const dot = clamp(incoming.x * outgoing.x + incoming.y * outgoing.y, -1, 1)
    const turnAngle = Math.acos(dot)
    return {
      x: point.x,
      y: point.y,
      distanceMeters: point.distanceMeters,
      targetSpeedFactor: round(clamp(1 - turnAngle / Math.PI * 1.8, 0.45, 1), 4),
    }
  })
}

function createGridSlots(centerline, lengthMeters, gapMeters) {
  return Array.from({ length: 4 }, (_, index) => {
    const row = Math.floor(index / 2) + 1
    const targetDistance = lengthMeters - row * gapMeters
    const point = sampleAtDistance(centerline, targetDistance, lengthMeters)
    const tangent = tangentAtDistance(centerline, targetDistance, lengthMeters)
    const normal = { x: -tangent.y, y: tangent.x }
    const lateralOffset = index % 2 === 0 ? -2.2 : 2.2
    return {
      position: vector({ x: point.x + normal.x * lateralOffset, y: point.y + normal.y * lateralOffset }),
      angle: round(Math.atan2(tangent.y, tangent.x), 6),
    }
  })
}

function createPitLane(centerline, lengthMeters) {
  const distances = [0.92, 0.94, 0.96, 0.98, 0, 0.02, 0.04, 0.06, 0.08].map((fraction) => fraction * lengthMeters)
  return {
    entryDistanceMeters: round(lengthMeters * 0.92),
    exitDistanceMeters: round(lengthMeters * 0.08),
    speedLimitMetersPerSecond: 22.222,
    path: distances.map((targetDistance) => {
      const point = sampleAtDistance(centerline, targetDistance, lengthMeters)
      const tangent = tangentAtDistance(centerline, targetDistance, lengthMeters)
      const normal = { x: tangent.y, y: -tangent.x }
      return vector({ x: point.x + normal.x * (point.halfWidthMeters + 3), y: point.y + normal.y * (point.halfWidthMeters + 3) })
    }),
  }
}

function boundsForPoints(points, margin = 0) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: round(Math.min(...xs) - margin),
    minY: round(Math.min(...ys) - margin),
    maxX: round(Math.max(...xs) + margin),
    maxY: round(Math.max(...ys) + margin),
  }
}

function createChunks(centerline, lengthMeters, halfWidthMeters) {
  const chunkCount = Math.ceil(lengthMeters / CHUNK_LENGTH_METERS)
  return Array.from({ length: chunkCount }, (_, index) => {
    const from = index * CHUNK_LENGTH_METERS
    const to = Math.min((index + 1) * CHUNK_LENGTH_METERS, lengthMeters)
    const points = centerline.filter((point) => point.distanceMeters >= from && point.distanceMeters <= to)
    points.push(sampleAtDistance(centerline, from, lengthMeters), sampleAtDistance(centerline, to, lengthMeters))
    return {
      index,
      fromDistanceMeters: from,
      toDistanceMeters: to,
      bounds: boundsForPoints(points, halfWidthMeters + 25),
    }
  })
}

function createSceneryLayout(centerline, lengthMeters, preset) {
  const anchorFractions = [0.25, 0.5, 0.75]
  const landmarks = anchorFractions.map((fraction, index) => {
    const targetDistance = lengthMeters * fraction
    const point = sampleAtDistance(centerline, targetDistance, lengthMeters)
    const tangent = tangentAtDistance(centerline, targetDistance, lengthMeters)
    const normal = { x: -tangent.y, y: tangent.x }
    return {
      id: `landmark-${index + 1}`,
      kind: `${preset}-landmark`,
      position: vector({ x: point.x + normal.x * 35, y: point.y + normal.y * 35 }),
      rotation: round(Math.atan2(tangent.y, tangent.x), 6),
      scale: 1,
    }
  })

  const start = centerline[0]
  const startTangent = tangentAtDistance(centerline, 0, lengthMeters)
  const startNormal = { x: -startTangent.y, y: startTangent.x }
  return {
    preset,
    landmarks,
    staticObjects: [
      {
        id: 'start-gantry',
        kind: 'start-gantry',
        position: vector(start),
        rotation: round(Math.atan2(startTangent.y, startTangent.x), 6),
        scale: 1,
      },
      {
        id: 'main-grandstand',
        kind: 'grandstand',
        position: vector({ x: start.x + startNormal.x * 45, y: start.y + startNormal.y * 45 }),
        rotation: round(Math.atan2(startTangent.y, startTangent.x), 6),
        scale: 1,
      },
    ],
  }
}

function assertTrack(track) {
  if (distance(track.centerline[0], track.centerline.at(-1)) > 0.01) throw new Error(`${track.id}: centerline is not closed`)
  if (track.checkpoints.length !== 8) throw new Error(`${track.id}: expected 8 checkpoints`)
  if (track.gridSlots.length !== 4) throw new Error(`${track.id}: expected 4 grid slots`)
  if (Math.abs(track.centerline.at(-1).distanceMeters - track.lengthMeters) > 0.01) throw new Error(`${track.id}: length mismatch`)
  if (track.chunks.at(-1).toDistanceMeters !== track.lengthMeters) throw new Error(`${track.id}: chunk coverage mismatch`)
}

function createTrack(feature, spec) {
  const expectedLengthMeters = Number(feature.properties.length)
  const projected = projectCoordinates(feature.geometry.coordinates, expectedLengthMeters)
  const centerline = resampleClosedPath(projected, expectedLengthMeters, spec.halfWidthMeters)
  const track = {
    schemaVersion: '1.0.0',
    catalogVersion: CATALOG_VERSION,
    id: spec.id,
    name: feature.properties.Name,
    countryCode: spec.countryCode,
    locality: spec.locality,
    lengthMeters: expectedLengthMeters,
    coordinateSystem: {
      unit: 'meter',
      xAxis: 'right',
      yAxis: 'up',
      angleUnit: 'radian',
      angleDirection: 'counterclockwise',
      angleOrigin: '+x',
    },
    bounds: boundsForPoints(centerline, spec.halfWidthMeters + 40),
    centerline,
    racingLine: createRacingLine(centerline),
    startFinish: gateAtDistance(0, centerline, 0, expectedLengthMeters),
    gridSlots: createGridSlots(centerline, expectedLengthMeters, 8),
    checkpoints: Array.from({ length: 8 }, (_, index) => gateAtDistance(index, centerline, expectedLengthMeters * (index + 1) / 9, expectedLengthMeters)),
    pitLane: createPitLane(centerline, expectedLengthMeters),
    surfaceModel: { onTrack: 'asphalt', offTrack: 'grass', pitLane: 'pit-lane' },
    chunks: createChunks(centerline, expectedLengthMeters, spec.halfWidthMeters),
    sceneryLayout: createSceneryLayout(centerline, expectedLengthMeters, spec.sceneryPreset),
    source: {
      dataset: 'bacinger/f1-circuits',
      license: 'MIT',
      url: 'https://github.com/bacinger/f1-circuits',
      transformation: 'Equirectangular projection around the first source coordinate, uniform scale to the published circuit length, closed-loop resampling every approximately 20 meters, and generated gameplay metadata.',
    },
  }
  assertTrack(track)
  return track
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function writeOrCheck(path, content) {
  if (!checkOnly) {
    await writeFile(path, content, 'utf8')
    return
  }
  const existing = await readFile(path, 'utf8')
  if (existing !== content) throw new Error(`${path} is not reproducible; run the generator`)
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'))
if (trackSpecs.length !== 24) throw new Error('The frozen calendar must contain exactly 24 tracks')

const definitions = []
for (const spec of trackSpecs) {
  const feature = source.features.find((candidate) => candidate.properties.Name === spec.sourceName)
  if (!feature) throw new Error(`Missing source geometry: ${spec.sourceName}`)
  definitions.push({ spec, track: createTrack(feature, spec) })
}

const ids = new Set(definitions.map(({ track }) => track.id))
if (ids.size !== 24) throw new Error('Track ids must be unique')

const catalog = {
  schemaVersion: '1.0.0',
  catalogVersion: CATALOG_VERSION,
  seasonReference: 2026,
  calendarPolicy: 'original-24-round-freeze',
  tracks: definitions.map(({ spec, track }) => ({
    round: spec.round,
    id: track.id,
    name: track.name,
    countryCode: spec.countryCode,
    countryName: spec.countryName,
    locality: spec.locality,
    lengthMeters: track.lengthMeters,
    definitionPath: `tracks/${track.id}.json`,
  })),
}

for (const { track } of definitions) {
  await writeOrCheck(resolve(contractDirectory, 'tracks', `${track.id}.json`), serialize(track))
}
await writeOrCheck(catalogPath, serialize(catalog))

const digest = createHash('sha256').update(serialize(catalog)).digest('hex')
console.log(`${checkOnly ? 'Validated' : 'Generated'} ${definitions.length} tracks for catalog ${CATALOG_VERSION} (${digest})`)
