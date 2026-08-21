import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { trackEnvironmentProfiles } from './track-environments.mjs'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..', '..')
const contractDirectory = resolve(repositoryRoot, 'contracts', 'module-2', 'v1')
const sourcePath = resolve(contractDirectory, 'source', 'f1-circuits-2026.geojson')
const catalogPath = resolve(contractDirectory, 'catalog.json')
const checkOnly = process.argv.includes('--check')

const EARTH_RADIUS_METERS = 6_371_008.8
const SAMPLE_INTERVAL_METERS = 20
const CHUNK_LENGTH_METERS = 250
const WIDTH_TRANSITION_METERS = 40
const SCHEMA_VERSION = '1.2.0'
const CATALOG_VERSION = '2026.3'
const TRACK_BARRIER_TYPES = [
  'concrete-wall',
  'guardrail',
  'tecpro',
  'tyre-barrier',
]
const TRACK_FENCE_TYPE = 'debris-fence'

const trackSpecs = [
  ['albert-park', 'Albert Park Circuit', 1, 'AU', 'Australia', 'Melbourne', 'park', 7],
  ['shanghai', 'Shanghai International Circuit', 2, 'CN', 'China', 'Shanghai', 'classic', 7.5],
  ['suzuka', 'Suzuka International Racing Course', 3, 'JP', 'Japan', 'Suzuka', 'classic', 7],
  ['bahrain', 'Bahrain International Circuit', 4, 'BH', 'Bahrain', 'Sakhir', 'desert', 7.5],
  ['jeddah', 'Jeddah Corniche Circuit', 5, 'SA', 'Saudi Arabia', 'Jeddah', 'coastal', 6.5],
  ['miami', 'Miami International Autodrome', 6, 'US', 'United States', 'Miami', 'street', 7],
  ['montreal', 'Circuit Gilles-Villeneuve', 7, 'CA', 'Canada', 'Montreal', 'park', 6.5],
  ['monaco', 'Circuit de Monaco', 8, 'MC', 'Monaco', 'Monaco', 'coastal', 6],
  ['barcelona', 'Circuit de Barcelona-Catalunya', 9, 'ES', 'Spain', 'Barcelona', 'classic', 7.5, null, 4657],
  ['spielberg', 'Red Bull Ring', 10, 'AT', 'Austria', 'Spielberg', 'classic', 7.5, null, 4326],
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
  ['lusail', 'Losail International Circuit', 23, 'QA', 'Qatar', 'Lusail', 'desert', 7.5, 'Lusail International Circuit', 5419],
  ['yas-marina', 'Yas Marina Circuit', 24, 'AE', 'United Arab Emirates', 'Abu Dhabi', 'coastal', 7.5],
].map(([id, sourceName, round, countryCode, countryName, locality, sceneryPreset, halfWidthMeters, officialName, officialLengthMeters]) => ({
  id,
  sourceName,
  round,
  countryCode,
  countryName,
  locality,
  sceneryPreset,
  halfWidthMeters,
  officialName,
  officialLengthMeters,
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

function elevationLayerAt(trackId, normalizedDistance) {
  // Suzuka's back straight crosses above the section after the Degners. The
  // interval is intentionally wider than the exact XY intersection so cars,
  // rendering and collision stay on one bridge layer through the approach and
  // exit rather than flipping at a single sample.
  return trackId === 'suzuka' && normalizedDistance >= 0.79 && normalizedDistance <= 0.83
    ? 1
    : 0
}

function smoothstep(value) {
  const normalized = clamp(value, 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

function halfWidthAt(widthProfile, normalizedDistance, lengthMeters) {
  const baseline = widthProfile.defaultHalfWidthMeters
  for (const override of widthProfile.overrides) {
    if (
      normalizedDistance < override.from ||
      normalizedDistance > override.to
    ) {
      continue
    }
    const transitionFraction = Math.min(
      WIDTH_TRANSITION_METERS / lengthMeters,
      (override.to - override.from) / 3,
    )
    if (
      override.from > 0 &&
      normalizedDistance < override.from + transitionFraction
    ) {
      return round(
        baseline +
          (override.halfWidthMeters - baseline) *
            smoothstep(
              (normalizedDistance - override.from) / transitionFraction,
            ),
      )
    }
    if (
      override.to < 1 &&
      normalizedDistance > override.to - transitionFraction
    ) {
      return round(
        override.halfWidthMeters +
          (baseline - override.halfWidthMeters) *
            smoothstep(
              (normalizedDistance - override.to + transitionFraction) /
                transitionFraction,
            ),
      )
    }
    return override.halfWidthMeters
  }
  return baseline
}

function resampleClosedPath(points, expectedLengthMeters, widthProfile, trackId) {
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
      halfWidthMeters: halfWidthAt(
        widthProfile,
        index / sampleCount,
        expectedLengthMeters,
      ),
      elevationLayer: elevationLayerAt(trackId, index / sampleCount),
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

function createChunks(centerline, lengthMeters, maximumTrackMarginMeters) {
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
      bounds: boundsForPoints(points, maximumTrackMarginMeters),
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

function sideEnvironmentAt(profile, fraction, side) {
  let environment = profile.default[side]
  for (const override of profile.overrides) {
    if (fraction >= override.from && fraction < override.to && override[side]) {
      environment = override[side]
    }
  }
  return {
    zones: structuredClone(environment.zones),
    barrier: environment.barrier,
    ...(environment.fence === undefined
      ? {}
      : { fence: environment.fence }),
  }
}

function createTrackLimits(lengthMeters, profile) {
  if (!profile || !profile.default?.left || !profile.default?.right) {
    throw new Error('Every track needs an explicit audited environment profile')
  }
  const breakpoints = [...new Set([
    0,
    1,
    ...profile.overrides.flatMap(({ from, to }) => [from, to]),
  ])].sort((left, right) => left - right)
  if (breakpoints[0] !== 0 || breakpoints.at(-1) !== 1) {
    throw new Error('Environment profile must cover the full normalized lap')
  }

  const rawSegments = breakpoints.slice(0, -1).map((from, index) => {
    const to = breakpoints[index + 1]
    const midpoint = (from + to) / 2
    return {
      from,
      to,
      left: sideEnvironmentAt(profile, midpoint, 'left'),
      right: sideEnvironmentAt(profile, midpoint, 'right'),
    }
  })
  const merged = []
  for (const segment of rawSegments) {
    const previous = merged.at(-1)
    if (
      previous &&
      JSON.stringify(previous.left) === JSON.stringify(segment.left) &&
      JSON.stringify(previous.right) === JSON.stringify(segment.right)
    ) {
      previous.to = segment.to
    } else {
      merged.push(segment)
    }
  }

  return {
    segments: merged.map((segment, index) => ({
      index,
      fromDistanceMeters: index === 0 ? 0 : round(segment.from * lengthMeters),
      toDistanceMeters: index === merged.length - 1 ? lengthMeters : round(segment.to * lengthMeters),
      left: segment.left,
      right: segment.right,
    })),
  }
}

function sideEnvironmentWidth(side) {
  return side.zones.reduce((sum, zone) => sum + zone.widthMeters, 0)
}

function maximumEnvironmentWidth(trackLimits) {
  return Math.max(
    ...trackLimits.segments.flatMap((segment) => [
      sideEnvironmentWidth(segment.left),
      sideEnvironmentWidth(segment.right),
    ]),
  )
}

function assertTrack(track) {
  if (distance(track.centerline[0], track.centerline.at(-1)) > 0.01) throw new Error(`${track.id}: centerline is not closed`)
  for (const point of track.centerline) {
    if (
      point.halfWidthMeters < 3.5 ||
      point.halfWidthMeters > 13 ||
      !Number.isInteger(point.elevationLayer) ||
      point.elevationLayer < 0 ||
      point.elevationLayer > 3
    ) {
      throw new Error(`${track.id}: invalid centerline width or elevation layer`)
    }
  }
  const elevationLayers = new Set(
    track.centerline.map((point) => point.elevationLayer),
  )
  if (
    track.id === 'suzuka' &&
    (!elevationLayers.has(0) || !elevationLayers.has(1))
  ) {
    throw new Error('suzuka: expected explicit overpass elevation layer')
  }
  if (track.checkpoints.length !== 8) throw new Error(`${track.id}: expected 8 checkpoints`)
  if (track.gridSlots.length !== 4) throw new Error(`${track.id}: expected 4 grid slots`)
  if (Math.abs(track.centerline.at(-1).distanceMeters - track.lengthMeters) > 0.01) throw new Error(`${track.id}: length mismatch`)
  if (track.chunks.at(-1).toDistanceMeters !== track.lengthMeters) throw new Error(`${track.id}: chunk coverage mismatch`)
  if (track.trackLimits.segments[0].fromDistanceMeters !== 0) throw new Error(`${track.id}: boundary coverage must start at zero`)
  if (track.trackLimits.segments.at(-1).toDistanceMeters !== track.lengthMeters) throw new Error(`${track.id}: boundary coverage must end at track length`)
  for (let index = 0; index < track.trackLimits.segments.length; index += 1) {
    const segment = track.trackLimits.segments[index]
    if (segment.index !== index) throw new Error(`${track.id}: boundary segment index mismatch`)
    if (index > 0 && segment.fromDistanceMeters !== track.trackLimits.segments[index - 1].toDistanceMeters) {
      throw new Error(`${track.id}: boundary segments must be contiguous`)
    }
    for (const side of [segment.left, segment.right]) {
      if (
        !Array.isArray(side.zones) ||
        side.zones.length > 4 ||
        side.zones.some(
          (zone) =>
            !['asphalt', 'grass', 'gravel'].includes(zone.surface) ||
            zone.widthMeters <= 0 ||
            zone.widthMeters > 60,
        )
      ) {
        throw new Error(`${track.id}: invalid environment zone`)
      }
      if (!TRACK_BARRIER_TYPES.includes(side.barrier)) {
        throw new Error(`${track.id}: invalid barrier type`)
      }
      if (
        side.fence !== undefined &&
        side.fence !== TRACK_FENCE_TYPE
      ) {
        throw new Error(`${track.id}: invalid fence type`)
      }
    }
  }
  if (track.id === 'monaco' && track.trackLimits.segments.some((segment) => [...segment.left.zones, ...segment.right.zones].some((zone) => zone.surface !== 'asphalt'))) {
    throw new Error('monaco: expected only paved margins before its walls')
  }
  if (track.id === 'interlagos') {
    const surfaces = new Set(track.trackLimits.segments.flatMap((segment) => [...segment.left.zones, ...segment.right.zones].map((zone) => zone.surface)))
    if (!surfaces.has('asphalt') || !surfaces.has('grass')) throw new Error('interlagos: expected audited asphalt and grass areas')
  }
}

function createTrack(feature, spec) {
  const expectedLengthMeters = spec.officialLengthMeters ?? Number(feature.properties.length)
  const environmentProfile = trackEnvironmentProfiles[spec.id]
  const projected = projectCoordinates(feature.geometry.coordinates, expectedLengthMeters)
  const centerline = resampleClosedPath(
    projected,
    expectedLengthMeters,
    environmentProfile.width,
    spec.id,
  )
  const trackLimits = createTrackLimits(expectedLengthMeters, environmentProfile)
  const maximumHalfWidthMeters = Math.max(
    ...centerline.map((point) => point.halfWidthMeters),
  )
  const maximumMarginMeters =
    maximumHalfWidthMeters + maximumEnvironmentWidth(trackLimits) + 4
  const track = {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: CATALOG_VERSION,
    id: spec.id,
    name: spec.officialName ?? feature.properties.Name,
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
    bounds: boundsForPoints(centerline, maximumMarginMeters),
    centerline,
    racingLine: createRacingLine(centerline),
    startFinish: gateAtDistance(0, centerline, 0, expectedLengthMeters),
    gridSlots: createGridSlots(centerline, expectedLengthMeters, 8),
    checkpoints: Array.from({ length: 8 }, (_, index) => gateAtDistance(index, centerline, expectedLengthMeters * (index + 1) / 9, expectedLengthMeters)),
    pitLane: createPitLane(centerline, expectedLengthMeters),
    surfaceModel: { onTrack: 'asphalt', pitLane: 'pit-lane' },
    trackLimits,
    chunks: createChunks(centerline, expectedLengthMeters, maximumMarginMeters),
    sceneryLayout: createSceneryLayout(centerline, expectedLengthMeters, spec.sceneryPreset),
    source: {
      dataset: 'bacinger/f1-circuits',
      license: 'MIT',
      url: 'https://github.com/bacinger/f1-circuits',
      transformation: 'Equirectangular projection around the first source coordinate, uniform scale to the published circuit length, closed-loop resampling every approximately 20 meters, generated gameplay metadata, and per-circuit side environments audited against the listed references.',
      environmentReferences: environmentProfile.references,
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
  const normalizedExisting = existing.replaceAll('\r\n', '\n')
  if (normalizedExisting !== content) throw new Error(`${path} is not reproducible; run the generator`)
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'))
if (trackSpecs.length !== 24) throw new Error('The frozen calendar must contain exactly 24 tracks')
const expectedProfileIds = trackSpecs.map((spec) => spec.id).sort()
const actualProfileIds = Object.keys(trackEnvironmentProfiles).sort()
if (JSON.stringify(actualProfileIds) !== JSON.stringify(expectedProfileIds)) {
  throw new Error(`Environment profiles must match the 24-track catalog: ${actualProfileIds.join(', ')}`)
}
const profileSignatures = new Set()
for (const spec of trackSpecs) {
  const profile = trackEnvironmentProfiles[spec.id]
  if (!Array.isArray(profile.references) || profile.references.length < 2) {
    throw new Error(`${spec.id}: expected at least two environment references`)
  }
  if (
    !profile.width ||
    profile.width.defaultHalfWidthMeters < 3.5 ||
    profile.width.defaultHalfWidthMeters > 13 ||
    !Array.isArray(profile.width.overrides)
  ) {
    throw new Error(`${spec.id}: invalid track width profile`)
  }
  const orderedWidthOverrides = [...profile.width.overrides].sort(
    (left, right) => left.from - right.from,
  )
  for (let index = 0; index < orderedWidthOverrides.length; index += 1) {
    const override = orderedWidthOverrides[index]
    if (
      override.from < 0 ||
      override.to > 1 ||
      override.to <= override.from ||
      override.halfWidthMeters < 3.5 ||
      override.halfWidthMeters > 13 ||
      (index > 0 &&
        override.from < orderedWidthOverrides[index - 1].to)
    ) {
      throw new Error(`${spec.id}: invalid track width override`)
    }
  }
  if (!Array.isArray(profile.overrides) || profile.overrides.length === 0) {
    throw new Error(`${spec.id}: expected circuit-specific environment intervals`)
  }
  for (const override of profile.overrides) {
    if (override.from < 0 || override.to > 1 || override.to <= override.from) {
      throw new Error(`${spec.id}: invalid normalized environment interval`)
    }
  }
  const orderedOverrides = [...profile.overrides].sort((left, right) => left.from - right.from)
  for (let index = 1; index < orderedOverrides.length; index += 1) {
    if (orderedOverrides[index].from < orderedOverrides[index - 1].to) {
      throw new Error(`${spec.id}: environment intervals must not overlap`)
    }
  }
  const signature = JSON.stringify({ default: profile.default, overrides: profile.overrides })
  if (profileSignatures.has(signature)) {
    throw new Error(`${spec.id}: environment profile duplicates another circuit`)
  }
  profileSignatures.add(signature)
}

const definitions = []
for (const spec of trackSpecs) {
  const feature = source.features.find((candidate) => candidate.properties.Name === spec.sourceName)
  if (!feature) throw new Error(`Missing source geometry: ${spec.sourceName}`)
  definitions.push({ spec, track: createTrack(feature, spec) })
}

const ids = new Set(definitions.map(({ track }) => track.id))
if (ids.size !== 24) throw new Error('Track ids must be unique')

const catalog = {
  schemaVersion: SCHEMA_VERSION,
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
