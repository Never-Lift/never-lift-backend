import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { trackEnvironmentProfiles } from './track-environments.mjs'
import { trackCurbProfiles } from './track-curbs.mjs'
import { trackSceneryProfiles } from './track-scenery.mjs'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..', '..')
const contractDirectory = resolve(repositoryRoot, 'contracts', 'module-2', 'v1')
const sourcePath = resolve(contractDirectory, 'source', 'f1-circuits-2026.geojson')
const catalogPath = resolve(contractDirectory, 'catalog.json')
const checkOnly = process.argv.includes('--check')

const EARTH_RADIUS_METERS = 6_371_008.8
const SAMPLE_INTERVAL_METERS = 5
const CHUNK_LENGTH_METERS = 250
const WIDTH_TRANSITION_METERS = 40
const CORNER_ROUNDING_RADIUS_METERS = 12
const TURN_SEARCH_STEP_METERS = 5
const TURN_MINIMUM_SEPARATION_METERS = 40
const SCHEMA_VERSION = '1.3.0'
const CATALOG_VERSION = '2026.5'
const TRACK_BARRIER_TYPES = [
  'concrete-wall',
  'guardrail',
  'tecpro',
  'tyre-barrier',
]
const TRACK_FENCE_TYPE = 'debris-fence'
const TRACK_CURB_PALETTES = [
  'red-white',
  'orange-white',
  'red-white-blue',
  'green-white-red',
  'red-yellow',
  'green-yellow',
  'maroon-white',
  'blue-white',
]

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
  const initialScale = expectedLengthMeters / rawLength
  const projected = rawPoints.map((point) => ({
    x: point.x * initialScale,
    y: point.y * initialScale,
  }))
  const smoothed = chaikinSmoothClosed(projected, 2)
  const rounded = roundClosedCorners(smoothed, CORNER_ROUNDING_RADIUS_METERS)
  const finalScale = expectedLengthMeters / closedLength(rounded)
  return rounded.map((point) => ({
    x: point.x * finalScale,
    y: point.y * finalScale,
  }))
}

function closedLength(points) {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    total += distance(points[index], points[(index + 1) % points.length])
  }
  return total
}

function interpolatePoint(from, to, ratio) {
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  }
}

function quadraticPoint(from, control, to, ratio) {
  const inverse = 1 - ratio
  return {
    x:
      inverse * inverse * from.x +
      2 * inverse * ratio * control.x +
      ratio * ratio * to.x,
    y:
      inverse * inverse * from.y +
      2 * inverse * ratio * control.y +
      ratio * ratio * to.y,
  }
}

function chaikinSmoothClosed(points, iterations) {
  let smoothed = points
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = []
    for (let index = 0; index < smoothed.length; index += 1) {
      const from = smoothed[index]
      const to = smoothed[(index + 1) % smoothed.length]
      next.push(interpolatePoint(from, to, 0.25))
      next.push(interpolatePoint(from, to, 0.75))
    }
    smoothed = next
  }
  return smoothed
}

function roundClosedCorners(points, radiusMeters) {
  const corners = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]
    const next = points[(index + 1) % points.length]
    const incomingLength = distance(previous, point)
    const outgoingLength = distance(point, next)
    const trimMeters = Math.min(
      radiusMeters,
      incomingLength * 0.35,
      outgoingLength * 0.35,
    )
    return {
      point,
      entry: interpolatePoint(
        point,
        previous,
        incomingLength === 0 ? 0 : trimMeters / incomingLength,
      ),
      exit: interpolatePoint(
        point,
        next,
        outgoingLength === 0 ? 0 : trimMeters / outgoingLength,
      ),
      trimMeters,
    }
  })

  const rounded = []
  for (const corner of corners) {
    rounded.push(corner.entry)
    const subdivisions = Math.max(3, Math.ceil(corner.trimMeters * 2 / 3))
    for (let index = 1; index <= subdivisions; index += 1) {
      rounded.push(
        quadraticPoint(
          corner.entry,
          corner.point,
          corner.exit,
          index / subdivisions,
        ),
      )
    }
  }
  return rounded
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

function normalizeAngle(angle) {
  let normalized = angle
  while (normalized > Math.PI) normalized -= Math.PI * 2
  while (normalized < -Math.PI) normalized += Math.PI * 2
  return normalized
}

function curvatureAtDistance(centerline, targetDistance, lengthMeters) {
  const before = sampleAtDistance(centerline, targetDistance - 35, lengthMeters)
  const current = sampleAtDistance(centerline, targetDistance, lengthMeters)
  const after = sampleAtDistance(centerline, targetDistance + 35, lengthMeters)
  const incoming = Math.atan2(current.y - before.y, current.x - before.x)
  const outgoing = Math.atan2(after.y - current.y, after.x - current.x)
  return normalizeAngle(outgoing - incoming)
}

function detectTurnAnchors(centerline, lengthMeters, expectedCount) {
  const candidates = []
  for (
    let distanceMeters = 0;
    distanceMeters < lengthMeters;
    distanceMeters += TURN_SEARCH_STEP_METERS
  ) {
    const signedCurvature = curvatureAtDistance(
      centerline,
      distanceMeters,
      lengthMeters,
    )
    candidates.push({
      distanceMeters,
      signedCurvature,
      score: Math.abs(signedCurvature),
    })
  }

  const selected = []
  for (const candidate of candidates.sort((left, right) => right.score - left.score)) {
    const overlaps = selected.some((turn) => {
      const direct = Math.abs(turn.distanceMeters - candidate.distanceMeters)
      return Math.min(direct, lengthMeters - direct) < TURN_MINIMUM_SEPARATION_METERS
    })
    if (!overlaps) selected.push(candidate)
    if (selected.length === expectedCount) break
  }
  return selected.sort((left, right) => left.distanceMeters - right.distanceMeters)
}

function splitWrappedRange(fromDistanceMeters, toDistanceMeters, lengthMeters) {
  const normalizedFrom = ((fromDistanceMeters % lengthMeters) + lengthMeters) % lengthMeters
  const span = toDistanceMeters - fromDistanceMeters
  const normalizedTo = normalizedFrom + span
  if (normalizedTo <= lengthMeters) {
    return [{ fromDistanceMeters: normalizedFrom, toDistanceMeters: normalizedTo }]
  }
  return [
    { fromDistanceMeters: normalizedFrom, toDistanceMeters: lengthMeters },
    { fromDistanceMeters: 0, toDistanceMeters: normalizedTo - lengthMeters },
  ]
}

function createCurbs(centerline, lengthMeters, profile) {
  const raw = []
  const append = (fromDistanceMeters, toDistanceMeters, side) => {
    for (const range of splitWrappedRange(
      fromDistanceMeters,
      toDistanceMeters,
      lengthMeters,
    )) {
      raw.push({
        ...range,
        side,
        widthMeters: profile.widthMeters,
        stripeLengthMeters: profile.stripeLengthMeters,
        palette: profile.palette,
      })
    }
  }

  for (const turn of detectTurnAnchors(
    centerline,
    lengthMeters,
    profile.turnCount,
  )) {
    const insideSide = turn.signedCurvature >= 0 ? 'left' : 'right'
    const outsideSide = insideSide === 'left' ? 'right' : 'left'
    append(
      turn.distanceMeters - profile.insideBeforeMeters,
      turn.distanceMeters + profile.insideAfterMeters,
      insideSide,
    )
    append(
      turn.distanceMeters + profile.exitStartMeters,
      turn.distanceMeters + profile.exitStartMeters + profile.exitLengthMeters,
      outsideSide,
    )
  }

  const merged = []
  for (const segment of raw.sort((left, right) =>
    left.side.localeCompare(right.side) ||
    left.fromDistanceMeters - right.fromDistanceMeters
  )) {
    const previous = merged.at(-1)
    if (
      previous &&
      previous.side === segment.side &&
      previous.palette === segment.palette &&
      previous.widthMeters === segment.widthMeters &&
      previous.stripeLengthMeters === segment.stripeLengthMeters &&
      segment.fromDistanceMeters <= previous.toDistanceMeters + 0.001
    ) {
      previous.toDistanceMeters = Math.max(
        previous.toDistanceMeters,
        segment.toDistanceMeters,
      )
    } else {
      merged.push({ ...segment })
    }
  }

  return merged
    .sort((left, right) =>
      left.fromDistanceMeters - right.fromDistanceMeters ||
      left.side.localeCompare(right.side),
    )
    .map((segment, index) => ({
      index,
      fromDistanceMeters: round(segment.fromDistanceMeters),
      toDistanceMeters: round(segment.toDistanceMeters),
      side: segment.side,
      widthMeters: segment.widthMeters,
      stripeLengthMeters: segment.stripeLengthMeters,
      palette: segment.palette,
    }))
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

function resolveSceneryObject(centerline, lengthMeters, definition) {
  const targetDistance = lengthMeters * definition.fraction
  const point = sampleAtDistance(centerline, targetDistance, lengthMeters)
  const tangent = tangentAtDistance(centerline, targetDistance, lengthMeters)
  const normal = { x: -tangent.y, y: tangent.x }
  const sideDirection = definition.side === 'left'
    ? 1
    : definition.side === 'right'
      ? -1
      : 0
  const distanceFromCenterline = point.halfWidthMeters + definition.offsetMeters
  return {
    id: definition.id,
    kind: definition.kind,
    position: vector({
      x: point.x + normal.x * distanceFromCenterline * sideDirection,
      y: point.y + normal.y * distanceFromCenterline * sideDirection,
    }),
    rotation: round(
      Math.atan2(tangent.y, tangent.x) + definition.rotationOffset,
      6,
    ),
    scale: definition.scale,
  }
}

function createSceneryLayout(centerline, lengthMeters, preset, profile) {
  const start = centerline[0]
  const startTangent = tangentAtDistance(centerline, 0, lengthMeters)
  return {
    preset,
    landmarks: profile.landmarks.map((definition) =>
      resolveSceneryObject(centerline, lengthMeters, definition)),
    staticObjects: [
      {
        id: 'start-gantry',
        kind: 'start-gantry',
        position: vector(start),
        rotation: round(Math.atan2(startTangent.y, startTangent.x), 6),
        scale: round(start.halfWidthMeters * 2.2),
      },
      ...profile.staticObjects.map((definition) =>
        resolveSceneryObject(centerline, lengthMeters, definition)),
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
  for (let index = 1; index < track.centerline.length; index += 1) {
    const segmentLength = distance(
      track.centerline[index - 1],
      track.centerline[index],
    )
    if (segmentLength > SAMPLE_INTERVAL_METERS + 0.02) {
      throw new Error(`${track.id}: centerline sampling gap exceeds 5 meters`)
    }
    if (index < 2) continue
    const previousHeading = Math.atan2(
      track.centerline[index - 1].y - track.centerline[index - 2].y,
      track.centerline[index - 1].x - track.centerline[index - 2].x,
    )
    const currentHeading = Math.atan2(
      track.centerline[index].y - track.centerline[index - 1].y,
      track.centerline[index].x - track.centerline[index - 1].x,
    )
    if (Math.abs(normalizeAngle(currentHeading - previousHeading)) > Math.PI / 3.6) {
      throw new Error(`${track.id}: centerline contains a visibly angular corner`)
    }
  }
  if (!Array.isArray(track.curbs) || track.curbs.length === 0) {
    throw new Error(`${track.id}: expected generated curb segments`)
  }
  for (let index = 0; index < track.curbs.length; index += 1) {
    const curb = track.curbs[index]
    if (
      curb.index !== index ||
      curb.fromDistanceMeters < 0 ||
      curb.toDistanceMeters > track.lengthMeters ||
      curb.toDistanceMeters <= curb.fromDistanceMeters ||
      !['left', 'right'].includes(curb.side) ||
      curb.widthMeters < 0.3 ||
      curb.widthMeters > 2.5 ||
      curb.stripeLengthMeters < 0.5 ||
      curb.stripeLengthMeters > 8 ||
      !TRACK_CURB_PALETTES.includes(curb.palette)
    ) {
      throw new Error(`${track.id}: invalid curb segment`)
    }
  }
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
  const curbProfile = trackCurbProfiles[spec.id]
  const sceneryProfile = trackSceneryProfiles[spec.id]
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
    curbs: createCurbs(centerline, expectedLengthMeters, curbProfile),
    trackLimits,
    chunks: createChunks(centerline, expectedLengthMeters, maximumMarginMeters),
    sceneryLayout: createSceneryLayout(
      centerline,
      expectedLengthMeters,
      spec.sceneryPreset,
      sceneryProfile,
    ),
    source: {
      dataset: 'bacinger/f1-circuits',
      license: 'MIT',
      url: 'https://github.com/bacinger/f1-circuits',
      transformation: 'Equirectangular projection around the first source coordinate, two-pass closed corner smoothing plus metric quadratic rounding capped at 12 meters, uniform scale to the published circuit length, closed-loop resampling every approximately 5 meters, generated curb metadata, and per-circuit side environments audited against the listed references.',
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
const actualCurbProfileIds = Object.keys(trackCurbProfiles).sort()
if (JSON.stringify(actualCurbProfileIds) !== JSON.stringify(expectedProfileIds)) {
  throw new Error(`Curb profiles must match the 24-track catalog: ${actualCurbProfileIds.join(', ')}`)
}
const actualSceneryProfileIds = Object.keys(trackSceneryProfiles).sort()
if (JSON.stringify(actualSceneryProfileIds) !== JSON.stringify(expectedProfileIds)) {
  throw new Error(`Scenery profiles must match the 24-track catalog: ${actualSceneryProfileIds.join(', ')}`)
}
const profileSignatures = new Set()
const scenerySignatures = new Set()
const sceneryObjectIds = new Set()
for (const spec of trackSpecs) {
  const profile = trackEnvironmentProfiles[spec.id]
  const curbProfile = trackCurbProfiles[spec.id]
  const sceneryProfile = trackSceneryProfiles[spec.id]
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
  if (
    !curbProfile ||
    !Number.isInteger(curbProfile.turnCount) ||
    curbProfile.turnCount < 1 ||
    !TRACK_CURB_PALETTES.includes(curbProfile.palette) ||
    curbProfile.widthMeters < 0.3 ||
    curbProfile.widthMeters > 2.5 ||
    curbProfile.stripeLengthMeters < 0.5 ||
    curbProfile.stripeLengthMeters > 8
  ) {
    throw new Error(`${spec.id}: invalid curb profile`)
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

  if (
    !Array.isArray(sceneryProfile?.landmarks) ||
    sceneryProfile.landmarks.length < 3 ||
    !Array.isArray(sceneryProfile.staticObjects) ||
    sceneryProfile.staticObjects.length < 1
  ) {
    throw new Error(`${spec.id}: expected explicit landmark and static-object scenery`)
  }
  if (new Set(sceneryProfile.landmarks.map(({ kind }) => kind)).size !== sceneryProfile.landmarks.length) {
    throw new Error(`${spec.id}: landmark kinds must describe distinct circuit features`)
  }
  const sceneryObjects = [...sceneryProfile.landmarks, ...sceneryProfile.staticObjects]
  const localIds = new Set()
  for (const object of sceneryObjects) {
    if (
      !object.id ||
      !object.kind ||
      object.kind.endsWith('-landmark') ||
      object.fraction < 0 ||
      object.fraction >= 1 ||
      !['left', 'right', 'center'].includes(object.side) ||
      object.offsetMeters < 0 ||
      object.offsetMeters > 70 ||
      (object.side !== 'center' && object.offsetMeters < 12) ||
      object.scale < 4 ||
      object.scale > 40 ||
      !Number.isFinite(object.rotationOffset)
    ) {
      throw new Error(`${spec.id}: invalid scenery object ${object.id ?? '<missing id>'}`)
    }
    if (localIds.has(object.id)) {
      throw new Error(`${spec.id}: duplicate scenery object id ${object.id}`)
    }
    localIds.add(object.id)
    sceneryObjectIds.add(`${spec.id}:${object.id}`)
  }
  const scenerySignature = JSON.stringify(sceneryProfile)
  if (scenerySignatures.has(scenerySignature)) {
    throw new Error(`${spec.id}: scenery profile duplicates another circuit`)
  }
  scenerySignatures.add(scenerySignature)
}
if (sceneryObjectIds.size < 96) {
  throw new Error('The scenery catalog needs at least four explicit objects per circuit')
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
