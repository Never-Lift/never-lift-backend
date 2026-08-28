import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fenceVisualProfileFor,
  infrastructureProfileFor,
  infrastructureReferencesFor,
} from './track-infrastructure-v2.mjs'
import { curbFidelityProfileFor } from './track-curbs-v2.mjs'
import {
  barrierOpeningsFor,
  escapeRoadsFor,
} from './track-escape-roads-v2.mjs'
import { turnAnchorsFor } from './track-turn-anchors-v2.mjs'
import { brakingMarkerProfileFor } from './track-braking-markers-v2.mjs'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..', '..')
const v1Directory = resolve(repositoryRoot, 'contracts', 'module-2', 'v1')
const v2Directory = resolve(repositoryRoot, 'contracts', 'module-2', 'v2')
const checkOnly = process.argv.includes('--check')

const SCHEMA_VERSION = '2.0.0'
const CATALOG_VERSION = '2026.10'
const PHYSICS_CONTRACT_VERSION = '2.0.0'
const ROUND_DECIMALS = 3
const CHUNK_LENGTH_METERS = 250
const BARRIER_TRANSITION_RADIUS_METERS = 24
const ADJACENT_ARM_LONGITUDINAL_WINDOW_METERS = 28
const ADJACENT_ARM_CLEARANCE_METERS = 2.5
const CURB_CONTINUITY_GAP_METERS = 1.5
const GRANDSTAND_FENCE_MARGIN_METERS = 54
const STRUCTURE_BARRIER_CLEARANCE_METERS = 4
const PIT_BARRIER_CLEARANCE_METERS = 2
const MAX_BARRIER_OFFSET_SLOPE = 0.42

const fullyFencedStreetCircuits = new Set([
  'baku',
  'jeddah',
  'las-vegas',
  'madrid',
  'miami',
  'monaco',
  'singapore',
])

const barrierThicknessMeters = Object.freeze({
  'concrete-wall': 0.35,
  guardrail: 0.25,
  tecpro: 1.5,
  'tyre-barrier': 1.2,
})

const monacoAdjacentArmRunoffOverrides = Object.freeze({
  1: 4,
  3: 4,
})

const shanghaiPitAdjacentTurnSegmentIndex = 2

function round(value, decimals = ROUND_DECIMALS) {
  return Number(value.toFixed(decimals))
}

function normalize(vector) {
  const magnitude = Math.hypot(vector.x, vector.y)
  return magnitude <= 1e-9
    ? { x: 1, y: 0 }
    : { x: vector.x / magnitude, y: vector.y / magnitude }
}

function sampleAtDistance(centerline, distanceMeters, lengthMeters) {
  const target = Math.max(0, Math.min(lengthMeters, distanceMeters))
  const nextIndex = centerline.findIndex((point) => point.distanceMeters >= target)
  const endIndex = Math.max(1, nextIndex < 0 ? centerline.length - 1 : nextIndex)
  const start = centerline[endIndex - 1]
  const end = centerline[endIndex]
  const span = end.distanceMeters - start.distanceMeters
  const ratio = span <= 1e-9 ? 0 : (target - start.distanceMeters) / span
  const nearestLayer = ratio < 0.5 ? start.elevationLayer : end.elevationLayer
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
    distanceMeters: target,
    halfWidthMeters:
      start.halfWidthMeters +
      (end.halfWidthMeters - start.halfWidthMeters) * ratio,
    elevationLayer: nearestLayer,
  }
}

function tangentAtDistance(centerline, distanceMeters, lengthMeters) {
  const radius = 2
  const before = sampleAtDistance(
    centerline,
    Math.max(0, distanceMeters - radius),
    lengthMeters,
  )
  const after = sampleAtDistance(
    centerline,
    Math.min(lengthMeters, distanceMeters + radius),
    lengthMeters,
  )
  if (Math.hypot(after.x - before.x, after.y - before.y) <= 1e-9) {
    const wrappedBefore = sampleAtDistance(
      centerline,
      (distanceMeters - radius + lengthMeters) % lengthMeters,
      lengthMeters,
    )
    const wrappedAfter = sampleAtDistance(
      centerline,
      (distanceMeters + radius) % lengthMeters,
      lengthMeters,
    )
    return normalize({
      x: wrappedAfter.x - wrappedBefore.x,
      y: wrappedAfter.y - wrappedBefore.y,
    })
  }
  return normalize({ x: after.x - before.x, y: after.y - before.y })
}

function moduloDistance(distanceMeters, lengthMeters) {
  const wrapped = distanceMeters % lengthMeters
  return wrapped < 0 ? wrapped + lengthMeters : wrapped
}

function circularDistance(first, second, lengthMeters) {
  const direct = Math.abs(first - second)
  return Math.min(direct, lengthMeters - direct)
}

function trackSideEnvironmentAt(track, distanceMeters, side) {
  const normalized = Math.min(
    track.lengthMeters - 1e-6,
    Math.max(0, moduloDistance(distanceMeters, track.lengthMeters)),
  )
  const segment = track.trackLimits.segments.find(
    (candidate) =>
      normalized >= candidate.fromDistanceMeters - 1e-6 &&
      normalized < candidate.toDistanceMeters - 1e-6,
  ) ?? track.trackLimits.segments.at(-1)
  return segment[side]
}

function rawBarrierFaceOffset(track, side, distanceMeters) {
  const center = sampleAtDistance(
    track.centerline,
    moduloDistance(distanceMeters, track.lengthMeters),
    track.lengthMeters,
  )
  const environment = trackSideEnvironmentAt(track, distanceMeters, side)
  return (
    center.halfWidthMeters +
    environment.zones.reduce((total, zone) => total + zone.widthMeters, 0)
  )
}

function adjacentArmSafeOffset(track, side, distanceMeters, desiredOffset) {
  const center = sampleAtDistance(
    track.centerline,
    moduloDistance(distanceMeters, track.lengthMeters),
    track.lengthMeters,
  )
  const tangent = tangentAtDistance(
    track.centerline,
    moduloDistance(distanceMeters, track.lengthMeters),
    track.lengthMeters,
  )
  const sideDirection = side === 'left' ? 1 : -1
  const outward = {
    x: -tangent.y * sideDirection,
    y: tangent.x * sideDirection,
  }
  let safeOffset = desiredOffset

  const beforeTangent = tangentAtDistance(
    track.centerline,
    moduloDistance(distanceMeters - 6, track.lengthMeters),
    track.lengthMeters,
  )
  const afterTangent = tangentAtDistance(
    track.centerline,
    moduloDistance(distanceMeters + 6, track.lengthMeters),
    track.lengthMeters,
  )
  const signedAngle = Math.atan2(
    beforeTangent.x * afterTangent.y - beforeTangent.y * afterTangent.x,
    beforeTangent.x * afterTangent.x + beforeTangent.y * afterTangent.y,
  )
  const sideIsInsideTurn =
    (signedAngle > 0 && side === 'left') ||
    (signedAngle < 0 && side === 'right')
  if (sideIsInsideTurn && Math.abs(signedAngle) > 0.01) {
    const localRadiusMeters = 12 / Math.abs(signedAngle)
    // An inner offset that reaches the curve radius folds back over itself.
    // Keep a conservative margin so the canonical wall remains a single,
    // smooth face even through tight chicanes and hairpins.
    safeOffset = Math.min(safeOffset, localRadiusMeters * 0.72)
  }

  for (const candidate of track.centerline) {
    if (candidate.elevationLayer !== center.elevationLayer) continue
    if (
      circularDistance(
        candidate.distanceMeters,
        moduloDistance(distanceMeters, track.lengthMeters),
        track.lengthMeters,
      ) < 65
    ) {
      continue
    }
    const relative = {
      x: candidate.x - center.x,
      y: candidate.y - center.y,
    }
    const lateral = relative.x * outward.x + relative.y * outward.y
    const longitudinal = Math.abs(
      relative.x * tangent.x + relative.y * tangent.y,
    )
    if (
      lateral <= center.halfWidthMeters ||
      longitudinal > ADJACENT_ARM_LONGITUDINAL_WINDOW_METERS
    ) {
      continue
    }
    safeOffset = Math.min(
      safeOffset,
      lateral - candidate.halfWidthMeters - ADJACENT_ARM_CLEARANCE_METERS,
    )
  }

  return Math.max(center.halfWidthMeters + 0.35, safeOffset)
}

function desiredBarrierFaceOffset(track, side, distanceMeters) {
  const sampleOffsets = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map(
    (factor) => factor * BARRIER_TRANSITION_RADIUS_METERS,
  )
  const weights = [1, 2, 3, 4, 3, 2, 1]
  const desired = sampleOffsets.reduce(
    (total, offset, index) =>
      total +
      rawBarrierFaceOffset(track, side, distanceMeters + offset) *
        weights[index],
    0,
  ) / weights.reduce((total, weight) => total + weight, 0)
  return desired
}

const stabilizedBarrierOffsetCache = new WeakMap()

function stabilizedBarrierOffsets(track, side) {
  let bySide = stabilizedBarrierOffsetCache.get(track)
  if (!bySide) {
    bySide = new Map()
    stabilizedBarrierOffsetCache.set(track, bySide)
  }
  const cached = bySide.get(side)
  if (cached) return cached

  const distances = [...new Set([
    0,
    track.lengthMeters,
    ...track.centerline.map((point) => point.distanceMeters),
    ...track.trackLimits.segments.flatMap((segment) => [
      segment.fromDistanceMeters,
      segment.toDistanceMeters,
    ]),
  ].map((distance) => round(distance)))].sort((first, second) => first - second)

  const samples = distances.map((distanceMeters) => {
    const desired = desiredBarrierFaceOffset(track, side, distanceMeters)
    return {
      distanceMeters,
      offsetMeters: adjacentArmSafeOffset(
        track,
        side,
        distanceMeters,
        desired,
      ),
    }
  })

  // A protection face may move inward to clear a neighboring track arm, but
  // it cannot jump there between two five-metre samples. Propagate every local
  // cap in both directions, producing a continuous, bounded transition. This
  // replaces the jagged saw-tooth offsets that were especially visible on
  // thick Tecpro and tyre barriers.
  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 1; index < samples.length; index += 1) {
      const span = samples[index].distanceMeters - samples[index - 1].distanceMeters
      samples[index].offsetMeters = Math.min(
        samples[index].offsetMeters,
        samples[index - 1].offsetMeters + span * MAX_BARRIER_OFFSET_SLOPE,
      )
    }
    for (let index = samples.length - 2; index >= 0; index -= 1) {
      const span = samples[index + 1].distanceMeters - samples[index].distanceMeters
      samples[index].offsetMeters = Math.min(
        samples[index].offsetMeters,
        samples[index + 1].offsetMeters + span * MAX_BARRIER_OFFSET_SLOPE,
      )
    }
  }
  const closedOffset = Math.min(
    samples[0].offsetMeters,
    samples.at(-1).offsetMeters,
  )
  samples[0].offsetMeters = closedOffset
  samples.at(-1).offsetMeters = closedOffset
  bySide.set(side, samples)
  return samples
}

function smoothedBarrierFaceOffset(track, side, distanceMeters) {
  const normalized = Math.max(
    0,
    Math.min(track.lengthMeters, distanceMeters),
  )
  const samples = stabilizedBarrierOffsets(track, side)
  const nextIndex = samples.findIndex(
    (sample) => sample.distanceMeters >= normalized - 1e-6,
  )
  if (nextIndex <= 0) return samples[0].offsetMeters
  const end = samples[nextIndex]
  const start = samples[nextIndex - 1]
  const span = end.distanceMeters - start.distanceMeters
  const ratio = span <= 1e-9 ? 0 : (normalized - start.distanceMeters) / span
  return start.offsetMeters + (end.offsetMeters - start.offsetMeters) * ratio
}

function barrierFacePoint(track, side, distanceMeters) {
  const center = sampleAtDistance(
    track.centerline,
    distanceMeters,
    track.lengthMeters,
  )
  const tangent = tangentAtDistance(
    track.centerline,
    distanceMeters,
    track.lengthMeters,
  )
  const leftNormal = { x: -tangent.y, y: tangent.x }
  const sign = side === 'left' ? 1 : -1
  const faceOffset = smoothedBarrierFaceOffset(track, side, distanceMeters)
  return {
    x: round(center.x + leftNormal.x * sign * faceOffset),
    y: round(center.y + leftNormal.y * sign * faceOffset),
    distanceMeters: round(distanceMeters),
    elevationLayer: center.elevationLayer,
  }
}

function distancesForSegment(track, segment) {
  const distances = [segment.fromDistanceMeters]
  for (const point of track.centerline) {
    if (
      point.distanceMeters > segment.fromDistanceMeters + 1e-6 &&
      point.distanceMeters < segment.toDistanceMeters - 1e-6
    ) {
      distances.push(point.distanceMeters)
    }
  }
  distances.push(segment.toDistanceMeters)
  return distances
}

function chunksForRange(chunks, fromDistanceMeters, toDistanceMeters) {
  return chunks
    .filter(
      (chunk) =>
        chunk.toDistanceMeters >= fromDistanceMeters - 1e-6 &&
        chunk.fromDistanceMeters <= toDistanceMeters + 1e-6,
    )
    .map((chunk) => chunk.index)
}

function splitPathByElevationLayer(path) {
  const groups = []
  let current = [path[0]]
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]
    const next = path[index]
    if (previous.elevationLayer === next.elevationLayer) {
      current.push(next)
      continue
    }

    const midpoint = {
      x: round((previous.x + next.x) / 2),
      y: round((previous.y + next.y) / 2),
      distanceMeters: round(
        (previous.distanceMeters + next.distanceMeters) / 2,
      ),
    }
    current.push({
      ...midpoint,
      elevationLayer: previous.elevationLayer,
    })
    groups.push(current)
    current = [
      { ...midpoint, elevationLayer: next.elevationLayer },
      next,
    ]
  }
  groups.push(current)
  return groups
}

function roundBarrierPathCorners(path) {
  if (path.length < 3) return path
  const rounded = [path[0]]
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1]
    const corner = path[index]
    const next = path[index + 1]
    const incoming = { x: corner.x - previous.x, y: corner.y - previous.y }
    const outgoing = { x: next.x - corner.x, y: next.y - corner.y }
    const incomingLength = Math.hypot(incoming.x, incoming.y)
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y)
    if (incomingLength <= 1e-6 || outgoingLength <= 1e-6) continue
    const incomingDirection = {
      x: incoming.x / incomingLength,
      y: incoming.y / incomingLength,
    }
    const outgoingDirection = {
      x: outgoing.x / outgoingLength,
      y: outgoing.y / outgoingLength,
    }
    const angle = Math.abs(Math.atan2(
      incomingDirection.x * outgoingDirection.y -
        incomingDirection.y * outgoingDirection.x,
      incomingDirection.x * outgoingDirection.x +
        incomingDirection.y * outgoingDirection.y,
    ))
    if (angle < 0.32) {
      rounded.push(corner)
      continue
    }
    const trimMeters = Math.min(incomingLength, outgoingLength) * 0.28
    const entryRatio = trimMeters / incomingLength
    const exitRatio = trimMeters / outgoingLength
    const entry = {
      x: corner.x - incomingDirection.x * trimMeters,
      y: corner.y - incomingDirection.y * trimMeters,
      distanceMeters:
        corner.distanceMeters -
        (corner.distanceMeters - previous.distanceMeters) * entryRatio,
      elevationLayer: corner.elevationLayer,
    }
    const exit = {
      x: corner.x + outgoingDirection.x * trimMeters,
      y: corner.y + outgoingDirection.y * trimMeters,
      distanceMeters:
        corner.distanceMeters +
        (next.distanceMeters - corner.distanceMeters) * exitRatio,
      elevationLayer: corner.elevationLayer,
    }
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      const inverse = 1 - ratio
      rounded.push({
        x: round(
          inverse * inverse * entry.x +
            2 * inverse * ratio * corner.x +
            ratio * ratio * exit.x,
        ),
        y: round(
          inverse * inverse * entry.y +
            2 * inverse * ratio * corner.y +
            ratio * ratio * exit.y,
        ),
        distanceMeters: round(
          entry.distanceMeters +
            (exit.distanceMeters - entry.distanceMeters) * ratio,
        ),
        elevationLayer: corner.elevationLayer,
      })
    }
  }
  rounded.push(path.at(-1))
  return rounded.filter(
    (point, index) =>
      index === 0 ||
      point.distanceMeters > rounded[index - 1].distanceMeters + 1e-4,
  )
}

function signedArea(first, second, third) {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  )
}

function properSegmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const firstSideStart = signedArea(firstStart, firstEnd, secondStart)
  const firstSideEnd = signedArea(firstStart, firstEnd, secondEnd)
  const secondSideStart = signedArea(secondStart, secondEnd, firstStart)
  const secondSideEnd = signedArea(secondStart, secondEnd, firstEnd)
  return (
    firstSideStart * firstSideEnd < -1e-8 &&
    secondSideStart * secondSideEnd < -1e-8
  )
}

function segmentIntersectionPoint(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDirection = {
    x: firstEnd.x - firstStart.x,
    y: firstEnd.y - firstStart.y,
  }
  const secondDirection = {
    x: secondEnd.x - secondStart.x,
    y: secondEnd.y - secondStart.y,
  }
  const denominator =
    firstDirection.x * secondDirection.y -
    firstDirection.y * secondDirection.x
  const betweenStarts = {
    x: secondStart.x - firstStart.x,
    y: secondStart.y - firstStart.y,
  }
  const ratio =
    (betweenStarts.x * secondDirection.y -
      betweenStarts.y * secondDirection.x) /
    denominator
  return {
    x: round(firstStart.x + firstDirection.x * ratio),
    y: round(firstStart.y + firstDirection.y * ratio),
  }
}

function removeBarrierPathLoops(path) {
  const simplePath = [...path]
  let changed = true
  while (changed) {
    changed = false
    for (let firstIndex = 0; firstIndex < simplePath.length - 1; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 2;
        secondIndex < simplePath.length - 1;
        secondIndex += 1
      ) {
        if (
          !properSegmentsIntersect(
            simplePath[firstIndex],
            simplePath[firstIndex + 1],
            simplePath[secondIndex],
            simplePath[secondIndex + 1],
          )
        ) {
          continue
        }
        const intersection = segmentIntersectionPoint(
          simplePath[firstIndex],
          simplePath[firstIndex + 1],
          simplePath[secondIndex],
          simplePath[secondIndex + 1],
        )
        simplePath.splice(firstIndex + 1, secondIndex - firstIndex, {
          ...intersection,
          distanceMeters: round(
            (simplePath[firstIndex].distanceMeters +
              simplePath[secondIndex + 1].distanceMeters) /
              2,
          ),
          elevationLayer: simplePath[firstIndex].elevationLayer,
        })
        changed = true
        break
      }
      if (changed) break
    }
  }
  return simplePath
}

function createBarrierGeometry(track) {
  const segments = []
  for (const trackLimitSegment of track.trackLimits.segments) {
    for (const side of ['left', 'right']) {
      const sideEnvironment = trackLimitSegment[side]
      const baseDistances = distancesForSegment(track, trackLimitSegment)
      const breakpoints = new Set(baseDistances)
      const openings = (track.barrierOpenings ?? []).filter(
        (opening) =>
          opening.side === side &&
          opening.fromDistanceMeters < trackLimitSegment.toDistanceMeters - 1e-6 &&
          opening.toDistanceMeters > trackLimitSegment.fromDistanceMeters + 1e-6,
      )
      for (const opening of openings) {
        breakpoints.add(
          Math.max(trackLimitSegment.fromDistanceMeters, opening.fromDistanceMeters),
        )
        breakpoints.add(
          Math.min(trackLimitSegment.toDistanceMeters, opening.toDistanceMeters),
        )
      }
      const distances = [...breakpoints].sort((first, second) => first - second)
      const visibleRanges = []
      let currentRange = []
      for (let rangeIndex = 0; rangeIndex < distances.length - 1; rangeIndex += 1) {
        const from = distances[rangeIndex]
        const to = distances[rangeIndex + 1]
        const midpoint = (from + to) / 2
        const isOpening =
          openings.some(
            (opening) =>
              midpoint > opening.fromDistanceMeters + 1e-6 &&
              midpoint < opening.toDistanceMeters - 1e-6,
          )
        if (isOpening) {
          if (currentRange.length >= 2) visibleRanges.push(currentRange)
          currentRange = []
          continue
        }
        if (currentRange.length === 0) currentRange.push(from)
        currentRange.push(to)
      }
      if (currentRange.length >= 2) visibleRanges.push(currentRange)

      for (const rangeDistances of visibleRanges) {
        const path = rangeDistances.map((distanceMeters) =>
          barrierFacePoint(track, side, distanceMeters),
        )
        for (const rawLayerPath of splitPathByElevationLayer(path)) {
          const layerPath = removeBarrierPathLoops(
            roundBarrierPathCorners(rawLayerPath),
          )
          const fromDistanceMeters = layerPath[0].distanceMeters
          const toDistanceMeters = layerPath.at(-1).distanceMeters
          segments.push({
            index: segments.length,
            trackLimitSegmentIndex: trackLimitSegment.index,
            side,
            fromDistanceMeters,
            toDistanceMeters,
            material: sideEnvironment.barrier,
            thicknessMeters: barrierThicknessMeters[sideEnvironment.barrier],
            collisionLayer: 'track-barrier',
            chunkIndexes: chunksForRange(
              track.chunks,
              fromDistanceMeters,
              toDistanceMeters,
            ),
            path: layerPath,
          })
        }
      }
    }
  }
  return { segments }
}

function interpolateClosedPathPoint(path, distanceMeters, lengthMeters) {
  const target = moduloDistance(distanceMeters, lengthMeters)
  const nextIndex = path.findIndex((point) => point.distanceMeters >= target)
  const endIndex = Math.max(1, nextIndex < 0 ? path.length - 1 : nextIndex)
  const start = path[endIndex - 1]
  const end = path[endIndex]
  const span = end.distanceMeters - start.distanceMeters
  const ratio = span <= 1e-9 ? 0 : (target - start.distanceMeters) / span
  const interpolated = {}
  for (const [key, value] of Object.entries(start)) {
    if (key === 'distanceMeters') continue
    const endValue = end[key]
    interpolated[key] =
      typeof value === 'number' && typeof endValue === 'number'
        ? round(value + (endValue - value) * ratio, key === 'targetSpeedFactor' ? 4 : ROUND_DECIMALS)
        : ratio < 0.5
          ? value
          : endValue
  }
  return { ...interpolated, distanceMeters: 0 }
}

function rebaseClosedPath(path, offsetMeters, lengthMeters) {
  const start = interpolateClosedPathPoint(path, offsetMeters, lengthMeters)
  const rebased = [
    start,
    ...path
      .filter(
        (point) =>
          point.distanceMeters > offsetMeters + 1e-6 &&
          point.distanceMeters < lengthMeters - 1e-6,
      )
      .map((point) => ({
        ...point,
        distanceMeters: round(point.distanceMeters - offsetMeters),
      })),
    {
      ...path[0],
      distanceMeters: round(lengthMeters - offsetMeters),
    },
    ...path
      .filter(
        (point) =>
          point.distanceMeters > 1e-6 &&
          point.distanceMeters < offsetMeters - 1e-6,
      )
      .map((point) => ({
        ...point,
        distanceMeters: round(
          point.distanceMeters + lengthMeters - offsetMeters,
        ),
      })),
  ].sort((first, second) => first.distanceMeters - second.distanceMeters)
  rebased.push({ ...start, distanceMeters: lengthMeters })
  return rebased
}

function rebaseIntervals(items, offsetMeters, lengthMeters) {
  const pieces = []
  for (const item of items) {
    const duration = item.toDistanceMeters - item.fromDistanceMeters
    const from = moduloDistance(item.fromDistanceMeters - offsetMeters, lengthMeters)
    const to = from + duration
    if (to <= lengthMeters + 1e-6) {
      pieces.push({
        ...item,
        fromDistanceMeters: round(from),
        toDistanceMeters: round(Math.min(lengthMeters, to)),
      })
      continue
    }
    pieces.push(
      {
        ...item,
        fromDistanceMeters: round(from),
        toDistanceMeters: lengthMeters,
      },
      {
        ...item,
        fromDistanceMeters: 0,
        toDistanceMeters: round(to - lengthMeters),
      },
    )
  }
  return pieces
    .filter((item) => item.toDistanceMeters - item.fromDistanceMeters > 1e-3)
    .sort((first, second) => first.fromDistanceMeters - second.fromDistanceMeters)
    .map((item, index) => ({ ...item, index }))
}

function signedTurnAtDistance(track, distanceMeters) {
  const before = tangentAtDistance(
    track.centerline,
    moduloDistance(distanceMeters - 6, track.lengthMeters),
    track.lengthMeters,
  )
  const after = tangentAtDistance(
    track.centerline,
    moduloDistance(distanceMeters + 6, track.lengthMeters),
    track.lengthMeters,
  )
  return before.x * after.y - before.y * after.x
}

function polygonBounds(vertices) {
  return vertices.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )
}

function boundsIntersect(first, second) {
  return !(
    first.maxX < second.minX ||
    first.minX > second.maxX ||
    first.maxY < second.minY ||
    first.minY > second.maxY
  )
}

function polygonAxes(vertices) {
  return vertices.map((point, index) => {
    const next = vertices[(index + 1) % vertices.length]
    return normalize({ x: -(next.y - point.y), y: next.x - point.x })
  })
}

function polygonsIntersect(first, second) {
  for (const axis of [...polygonAxes(first), ...polygonAxes(second)]) {
    const firstProjection = first.map((point) => point.x * axis.x + point.y * axis.y)
    const secondProjection = second.map((point) => point.x * axis.x + point.y * axis.y)
    if (
      Math.max(...firstProjection) < Math.min(...secondProjection) - 1e-8 ||
      Math.max(...secondProjection) < Math.min(...firstProjection) - 1e-8
    ) {
      return false
    }
  }
  return true
}

function orientedRectangle(center, rotation, lengthMeters, depthMeters) {
  const tangent = { x: Math.cos(rotation), y: Math.sin(rotation) }
  const normal = { x: -tangent.y, y: tangent.x }
  const halfLength = lengthMeters / 2
  const halfDepth = depthMeters / 2
  return [
    {
      x: center.x + tangent.x * halfLength + normal.x * halfDepth,
      y: center.y + tangent.y * halfLength + normal.y * halfDepth,
    },
    {
      x: center.x - tangent.x * halfLength + normal.x * halfDepth,
      y: center.y - tangent.y * halfLength + normal.y * halfDepth,
    },
    {
      x: center.x - tangent.x * halfLength - normal.x * halfDepth,
      y: center.y - tangent.y * halfLength - normal.y * halfDepth,
    },
    {
      x: center.x + tangent.x * halfLength - normal.x * halfDepth,
      y: center.y + tangent.y * halfLength - normal.y * halfDepth,
    },
  ]
}

function roadSurfaceCollider(from, to) {
  const direction = normalize({ x: to.x - from.x, y: to.y - from.y })
  const normal = { x: -direction.y, y: direction.x }
  return [
    {
      x: from.x + normal.x * from.halfWidthMeters,
      y: from.y + normal.y * from.halfWidthMeters,
    },
    {
      x: to.x + normal.x * to.halfWidthMeters,
      y: to.y + normal.y * to.halfWidthMeters,
    },
    {
      x: to.x - normal.x * to.halfWidthMeters,
      y: to.y - normal.y * to.halfWidthMeters,
    },
    {
      x: from.x - normal.x * from.halfWidthMeters,
      y: from.y - normal.y * from.halfWidthMeters,
    },
  ]
}

function barrierCollider(segment, pathIndex) {
  const from = segment.path[pathIndex]
  const to = segment.path[pathIndex + 1]
  const direction = normalize({ x: to.x - from.x, y: to.y - from.y })
  const leftNormal = { x: -direction.y, y: direction.x }
  const inwardNormal =
    segment.side === 'left'
      ? { x: -leftNormal.x, y: -leftNormal.y }
      : leftNormal
  const outward = {
    x: -inwardNormal.x * segment.thicknessMeters,
    y: -inwardNormal.y * segment.thicknessMeters,
  }
  return [
    { x: from.x, y: from.y },
    { x: from.x + outward.x, y: from.y + outward.y },
    { x: to.x + outward.x, y: to.y + outward.y },
    { x: to.x, y: to.y },
  ]
}

const structureObstacleCache = new WeakMap()

function structureObstacles(track) {
  const cached = structureObstacleCache.get(track)
  if (cached) return cached
  const road = track.centerline.slice(0, -1).map((from, index) => {
    const collider = roadSurfaceCollider(from, track.centerline[index + 1])
    return { id: `road-${index}`, collider, bounds: polygonBounds(collider) }
  })
  const barriers = track.barrierGeometry.segments.flatMap((segment) =>
    segment.path.slice(0, -1).map((_, pathIndex) => {
      const collider = barrierCollider(segment, pathIndex)
      return {
        id: `barrier-${segment.side}-${segment.trackLimitSegmentIndex}-${pathIndex}`,
        collider,
        bounds: polygonBounds(collider),
      }
    }),
  )
  const result = [...road, ...barriers]
  structureObstacleCache.set(track, result)
  return result
}

function normalizeAngle(angle) {
  let normalized = angle
  while (normalized > Math.PI) normalized -= Math.PI * 2
  while (normalized < -Math.PI) normalized += Math.PI * 2
  return normalized
}

function curvatureAtDistance(track, distanceMeters) {
  const before = sampleAtDistance(
    track.centerline,
    moduloDistance(distanceMeters - 35, track.lengthMeters),
    track.lengthMeters,
  )
  const current = sampleAtDistance(
    track.centerline,
    moduloDistance(distanceMeters, track.lengthMeters),
    track.lengthMeters,
  )
  const after = sampleAtDistance(
    track.centerline,
    moduloDistance(distanceMeters + 35, track.lengthMeters),
    track.lengthMeters,
  )
  const incoming = Math.atan2(current.y - before.y, current.x - before.x)
  const outgoing = Math.atan2(after.y - current.y, after.x - current.x)
  return normalizeAngle(outgoing - incoming)
}

function detectTurnAnchors(track, expectedCount) {
  return turnAnchorsFor(
    track.id,
    expectedCount,
    track.lengthMeters,
  ).map((distanceMeters) => ({
    distanceMeters,
    signedCurvature: curvatureAtDistance(track, distanceMeters),
  }))
}

function createAuthoredCurbs(track, profile) {
  const curbs = []
  const append = (fromDistanceMeters, toDistanceMeters, side, style) => {
    for (const range of splitWrappedFenceRange(
      fromDistanceMeters,
      toDistanceMeters,
      track.lengthMeters,
    )) {
      curbs.push({
        index: curbs.length,
        fromDistanceMeters: round(range.fromDistanceMeters),
        toDistanceMeters: round(range.toDistanceMeters),
        side,
        widthMeters: style.widthMeters,
        stripeLengthMeters: style.stripeLengthMeters,
        palette: style.palette,
        ...(typeof style.outerColor === 'string'
          ? {
              outerColor: style.outerColor,
              outerWidthMeters: style.outerWidthMeters,
            }
          : {}),
      })
    }
  }

  for (const [turnIndex, turn] of detectTurnAnchors(
    track,
    profile.turnCount,
  ).entries()) {
    const style = {
      ...profile.defaults,
      ...(profile.turns[turnIndex + 1] ?? {}),
    }
    const insideSide = turn.signedCurvature >= 0 ? 'left' : 'right'
    const outsideSide = insideSide === 'left' ? 'right' : 'left'
    if (style.apex) {
      append(
        turn.distanceMeters - style.insideBeforeMeters,
        turn.distanceMeters + style.insideAfterMeters,
        insideSide,
        style,
      )
    }
    if (style.exit) {
      append(
        turn.distanceMeters + style.exitStartMeters,
        turn.distanceMeters + style.exitStartMeters + style.exitLengthMeters,
        outsideSide,
        style,
      )
    }
  }
  return curbs
    .sort(
      (first, second) =>
        first.fromDistanceMeters - second.fromDistanceMeters ||
        first.side.localeCompare(second.side),
    )
    .map((curb, index) => ({ ...curb, index }))
}

function canBridgeCurbGap(_track, previous, next) {
  const gap = next.fromDistanceMeters - previous.toDistanceMeters
  if (gap < -1e-6) return true
  return gap <= CURB_CONTINUITY_GAP_METERS
}

function mergeNearbyCurbs(track, curbs) {
  const merged = []
  const groups = new Map()
  for (const curb of curbs) {
    const key = [
      curb.side,
      curb.palette,
      curb.widthMeters,
      curb.stripeLengthMeters,
      curb.outerColor ?? '',
      curb.outerWidthMeters ?? '',
    ].join(':')
    const group = groups.get(key) ?? []
    group.push(curb)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    group.sort(
      (first, second) =>
        first.fromDistanceMeters - second.fromDistanceMeters,
    )
    for (const curb of group) {
      const previous = merged.at(-1)
      if (
        previous &&
        previous.side === curb.side &&
        previous.palette === curb.palette &&
        previous.widthMeters === curb.widthMeters &&
        previous.stripeLengthMeters === curb.stripeLengthMeters &&
        previous.outerColor === curb.outerColor &&
        previous.outerWidthMeters === curb.outerWidthMeters &&
        canBridgeCurbGap(track, previous, curb)
      ) {
        previous.toDistanceMeters = Math.max(
          previous.toDistanceMeters,
          curb.toDistanceMeters,
        )
      } else {
        merged.push({ ...curb })
      }
    }
  }
  const ordered = merged
    .sort(
      (first, second) =>
        first.fromDistanceMeters - second.fromDistanceMeters ||
        first.side.localeCompare(second.side),
    )
  for (const side of ['left', 'right']) {
    const sideCurbs = ordered.filter((curb) => curb.side === side)
    for (let index = 1; index < sideCurbs.length; index += 1) {
      const previous = sideCurbs[index - 1]
      const current = sideCurbs[index]
      if (current.fromDistanceMeters >= previous.toDistanceMeters) continue
      const transition = round(
        (current.fromDistanceMeters + previous.toDistanceMeters) / 2,
      )
      previous.toDistanceMeters = transition
      current.fromDistanceMeters = transition
    }
  }
  return ordered.map((curb, index) => ({ ...curb, index }))
}

function splitWrappedFenceRange(fromDistanceMeters, toDistanceMeters, lengthMeters) {
  const from = moduloDistance(fromDistanceMeters, lengthMeters)
  const span = toDistanceMeters - fromDistanceMeters
  if (from + span <= lengthMeters) {
    return [{ fromDistanceMeters: from, toDistanceMeters: from + span }]
  }
  return [
    { fromDistanceMeters: from, toDistanceMeters: lengthMeters },
    { fromDistanceMeters: 0, toDistanceMeters: from + span - lengthMeters },
  ]
}

function projectPointToCenterline(track, position) {
  let projection
  let shortestSquaredDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < track.centerline.length - 1; index += 1) {
    const from = track.centerline[index]
    const to = track.centerline[index + 1]
    const segment = { x: to.x - from.x, y: to.y - from.y }
    const lengthSquared = segment.x * segment.x + segment.y * segment.y
    const ratio = lengthSquared <= 1e-9
      ? 0
      : Math.max(
        0,
        Math.min(
          1,
          ((position.x - from.x) * segment.x +
            (position.y - from.y) * segment.y) / lengthSquared,
        ),
      )
    const point = {
      x: from.x + segment.x * ratio,
      y: from.y + segment.y * ratio,
    }
    const squaredDistance =
      (position.x - point.x) ** 2 + (position.y - point.y) ** 2
    if (squaredDistance >= shortestSquaredDistance) continue
    const tangent = normalize(segment)
    const cross =
      tangent.x * (position.y - point.y) -
      tangent.y * (position.x - point.x)
    shortestSquaredDistance = squaredDistance
    projection = {
      distanceMeters:
        from.distanceMeters +
        (to.distanceMeters - from.distanceMeters) * ratio,
      side: cross >= 0 ? 'left' : 'right',
    }
  }
  if (!projection) throw new Error(`${track.id}: cannot project infrastructure`)
  return projection
}

function addStructureSafetyFences(track, trackLimits, staticObjects) {
  if (fullyFencedStreetCircuits.has(track.id)) {
    return {
      ...trackLimits,
      segments: trackLimits.segments.map((segment, index) => ({
        ...segment,
        index,
        left: { ...segment.left, fence: 'debris-fence' },
        right: { ...segment.right, fence: 'debris-fence' },
      })),
    }
  }

  const ranges = staticObjects
    .filter((object) => object.kind.includes('grandstand'))
    .flatMap((object) => {
      const projection = projectPointToCenterline(track, object.position)
      const margin = Math.max(
        GRANDSTAND_FENCE_MARGIN_METERS,
        (object.dimensions?.lengthMeters ?? object.scale * 1.65) / 2 + 12,
      )
      return splitWrappedFenceRange(
        projection.distanceMeters - margin,
        projection.distanceMeters + margin,
        track.lengthMeters,
      ).map((range) => ({ ...range, side: projection.side }))
    })

  const segments = []
  for (const segment of trackLimits.segments) {
    const breakpoints = new Set([
      segment.fromDistanceMeters,
      segment.toDistanceMeters,
    ])
    for (const range of ranges) {
      if (
        range.fromDistanceMeters > segment.fromDistanceMeters + 1e-6 &&
        range.fromDistanceMeters < segment.toDistanceMeters - 1e-6
      ) {
        breakpoints.add(range.fromDistanceMeters)
      }
      if (
        range.toDistanceMeters > segment.fromDistanceMeters + 1e-6 &&
        range.toDistanceMeters < segment.toDistanceMeters - 1e-6
      ) {
        breakpoints.add(range.toDistanceMeters)
      }
    }
    const ordered = [...breakpoints].sort((first, second) => first - second)
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const fromDistanceMeters = ordered[index]
      const toDistanceMeters = ordered[index + 1]
      const midpoint = (fromDistanceMeters + toDistanceMeters) / 2
      const fencedSides = new Set(
        ranges
          .filter(
            (range) =>
              midpoint >= range.fromDistanceMeters - 1e-6 &&
              midpoint <= range.toDistanceMeters + 1e-6,
          )
          .map((range) => range.side),
      )
      segments.push({
        ...segment,
        fromDistanceMeters: round(fromDistanceMeters),
        toDistanceMeters: round(toDistanceMeters),
        left: fencedSides.has('left')
          ? { ...segment.left, fence: 'debris-fence' }
          : segment.left,
        right: fencedSides.has('right')
          ? { ...segment.right, fence: 'debris-fence' }
          : segment.right,
      })
    }
  }
  return {
    ...trackLimits,
    segments: segments.map((segment, index) => ({ ...segment, index })),
  }
}

function gateAtDistance(index, centerline, distanceMeters, lengthMeters) {
  const point = sampleAtDistance(centerline, distanceMeters, lengthMeters)
  const tangent = tangentAtDistance(centerline, distanceMeters, lengthMeters)
  return {
    index,
    distanceMeters: round(distanceMeters),
    position: { x: round(point.x), y: round(point.y) },
    forward: { x: round(tangent.x), y: round(tangent.y) },
    halfWidthMeters: round(point.halfWidthMeters + 2),
  }
}

function createGridSlots(centerline, lengthMeters) {
  return Array.from({ length: 4 }, (_, index) => {
    const row = Math.floor(index / 2) + 1
    const distanceMeters = lengthMeters - row * 8
    const point = sampleAtDistance(centerline, distanceMeters, lengthMeters)
    const tangent = tangentAtDistance(centerline, distanceMeters, lengthMeters)
    const normal = { x: -tangent.y, y: tangent.x }
    const lateralOffset = index % 2 === 0 ? -2.2 : 2.2
    return {
      position: {
        x: round(point.x + normal.x * lateralOffset),
        y: round(point.y + normal.y * lateralOffset),
      },
      angle: round(Math.atan2(tangent.y, tangent.x), 6),
    }
  })
}

function maximumEnvironmentWidth(trackLimits) {
  return Math.max(
    ...trackLimits.segments.flatMap((segment) =>
      ['left', 'right'].map((side) =>
        segment[side].zones.reduce(
          (total, zone) => total + zone.widthMeters,
          0,
        ),
      ),
    ),
  )
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

function createChunks(centerline, lengthMeters, trackLimits) {
  const maximumHalfWidth = Math.max(
    ...centerline.map((point) => point.halfWidthMeters),
  )
  const margin = maximumHalfWidth + maximumEnvironmentWidth(trackLimits) + 4
  const count = Math.ceil(lengthMeters / CHUNK_LENGTH_METERS)
  return Array.from({ length: count }, (_, index) => {
    const fromDistanceMeters = index * CHUNK_LENGTH_METERS
    const toDistanceMeters = Math.min(
      (index + 1) * CHUNK_LENGTH_METERS,
      lengthMeters,
    )
    const points = centerline.filter(
      (point) =>
        point.distanceMeters >= fromDistanceMeters &&
        point.distanceMeters <= toDistanceMeters,
    )
    points.push(
      sampleAtDistance(centerline, fromDistanceMeters, lengthMeters),
      sampleAtDistance(centerline, toDistanceMeters, lengthMeters),
    )
    return {
      index,
      fromDistanceMeters,
      toDistanceMeters,
      bounds: boundsForPoints(points, margin),
    }
  })
}

function rebaseTrack(track, offsetMeters) {
  if (!offsetMeters) return track
  const centerline = rebaseClosedPath(
    track.centerline,
    offsetMeters,
    track.lengthMeters,
  )
  const racingLine = rebaseClosedPath(
    track.racingLine,
    offsetMeters,
    track.lengthMeters,
  )
  const trackLimits = {
    ...track.trackLimits,
    segments: rebaseIntervals(
      track.trackLimits.segments,
      offsetMeters,
      track.lengthMeters,
    ),
  }
  return {
    ...track,
    centerline,
    racingLine,
    curbs: rebaseIntervals(track.curbs, offsetMeters, track.lengthMeters),
    trackLimits,
    chunks: createChunks(centerline, track.lengthMeters, trackLimits),
  }
}

function createPitLane(track, profile) {
  const entryDistanceMeters = round(
    track.lengthMeters * profile.pitEntryFraction,
  )
  const exitDistanceMeters = round(
    track.lengthMeters * profile.pitExitFraction,
  )
  const span = track.lengthMeters - entryDistanceMeters + exitDistanceMeters
  const sampleCount = Math.max(25, Math.ceil(span / 18))
  const sideDirection = profile.pitSide === 'left' ? 1 : -1
  const smoothstep = (value) => {
    const clamped = Math.max(0, Math.min(1, value))
    return clamped * clamped * (3 - 2 * clamped)
  }
  const path = Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / (sampleCount - 1)
    const unwrappedDistance = entryDistanceMeters + span * progress
    const distanceMeters = moduloDistance(unwrappedDistance, track.lengthMeters)
    const point = sampleAtDistance(
      track.centerline,
      distanceMeters,
      track.lengthMeters,
    )
    const tangent = tangentAtDistance(
      track.centerline,
      distanceMeters,
      track.lengthMeters,
    )
    const normal = { x: -tangent.y, y: tangent.x }
    const merge = progress < profile.pitVisual.garageStartRatio
      ? smoothstep(progress / profile.pitVisual.garageStartRatio)
      : progress > profile.pitVisual.garageEndRatio
        ? smoothstep((1 - progress) / (1 - profile.pitVisual.garageEndRatio))
        : 1
    const barrierOffset = smoothedBarrierFaceOffset(
      track,
      profile.pitSide,
      distanceMeters,
    )
    const barrierType = trackSideEnvironmentAt(
      track,
      distanceMeters,
      profile.pitSide,
    ).barrier
    const barrierThickness = barrierType
      ? barrierThicknessMeters[barrierType]
      : 0
    const minimumSeparatedOffset =
      barrierOffset +
      barrierThickness +
      profile.pitVisual.laneWidthMeters / 2 +
      PIT_BARRIER_CLEARANCE_METERS
    const offset = Math.max(
      point.halfWidthMeters + profile.pitOffsetMeters,
      minimumSeparatedOffset,
    ) * sideDirection * merge
    return {
      x: round(point.x + normal.x * offset),
      y: round(point.y + normal.y * offset),
    }
  })
  const pathLengthMeters = path.slice(1).reduce(
    (total, point, index) =>
      total + Math.hypot(point.x - path[index].x, point.y - path[index].y),
    0,
  )
  const garageSpanMeters = Math.min(
    pathLengthMeters * 0.72,
    profile.pitVisual.garageCount *
      (profile.pitVisual.pitBoxLengthMeters + 0.8),
  )
  const garageCenterRatio = profile.pitGarageCenterRatio ?? 0.5
  const garageStartRatio = Math.max(
    0.05,
    garageCenterRatio - garageSpanMeters / pathLengthMeters / 2,
  )
  const garageEndRatio = Math.min(
    0.95,
    garageCenterRatio + garageSpanMeters / pathLengthMeters / 2,
  )
  return {
    entryDistanceMeters,
    exitDistanceMeters,
    speedLimitMetersPerSecond: 22.222,
    path,
    visualStyle: {
      ...profile.pitVisual,
      garageStartRatio: round(garageStartRatio, 6),
      garageEndRatio: round(garageEndRatio, 6),
    },
  }
}

function infrastructureObject(
  track,
  id,
  kind,
  distanceMeters,
  side,
  offset,
  scale,
  visualStyle,
  rotationOffset = 0,
  dimensions,
  occupied = [],
) {
  const sideDirection = side === 'left' ? 1 : -1
  const depthMeters = dimensions?.depthMeters ?? scale * 0.82
  const lengthMeters = dimensions?.lengthMeters ?? scale * 1.35
  const obstacles = [...structureObstacles(track), ...occupied]
  const distanceAdjustments = [0]
  let placement
  let lastOverlapId
  for (const distanceAdjustment of distanceAdjustments) {
    const candidateDistance = moduloDistance(
      distanceMeters + distanceAdjustment,
      track.lengthMeters,
    )
    const point = sampleAtDistance(
      track.centerline,
      candidateDistance,
      track.lengthMeters,
    )
    const tangent = tangentAtDistance(
      track.centerline,
      candidateDistance,
      track.lengthMeters,
    )
    const normal = { x: -tangent.y, y: tangent.x }
    const authoredOffset = point.halfWidthMeters + offset
    const barrierEnvelopeOffset = [-0.5, -0.33, -0.16, 0, 0.16, 0.33, 0.5]
      .map((factor) =>
        smoothedBarrierFaceOffset(
          track,
          side,
          moduloDistance(
            candidateDistance + lengthMeters * factor,
            track.lengthMeters,
          ),
        ),
      )
      .reduce((maximum, candidate) => Math.max(maximum, candidate), 0)
    const minimumCenterOffset = Math.max(
      authoredOffset,
      barrierEnvelopeOffset + depthMeters / 2 + STRUCTURE_BARRIER_CLEARANCE_METERS,
    )
    const rotation = Math.atan2(tangent.y, tangent.x) + rotationOffset
    for (const centerOffset of [minimumCenterOffset]) {
      const candidate = {
        x: point.x + normal.x * sideDirection * centerOffset,
        y: point.y + normal.y * sideDirection * centerOffset,
      }
      const collider = orientedRectangle(
        candidate,
        rotation,
        lengthMeters,
        depthMeters,
      )
      const bounds = polygonBounds(collider)
      const overlap = obstacles.find(
        (obstacle) =>
          boundsIntersect(bounds, obstacle.bounds) &&
          polygonsIntersect(collider, obstacle.collider),
      )
      lastOverlapId = overlap?.id
      if (!overlap) {
        placement = { position: candidate, rotation }
        break
      }
    }
    if (placement) break
  }
  if (!placement) {
    throw new Error(
      `${track.id}: cannot place ${id} without an overlap (${lastOverlapId ?? 'unknown'})`,
    )
  }
  return {
    id,
    kind,
    position: {
      x: round(placement.position.x),
      y: round(placement.position.y),
    },
    rotation: round(placement.rotation, 6),
    scale,
    ...(dimensions ? { dimensions } : {}),
    ...(visualStyle ? { visualStyle } : {}),
  }
}

function createSceneryLayout(track, profile) {
  const start = track.centerline[0]
  const tangent = tangentAtDistance(track.centerline, 0, track.lengthMeters)
  const staticObjects = [{
    id: 'start-gantry',
    kind: 'start-gantry',
    position: { x: round(start.x), y: round(start.y) },
    rotation: round(Math.atan2(tangent.y, tangent.x), 6),
    scale: round(start.halfWidthMeters * 2.2),
  }]
  const occupied = []
  for (const object of profile.structures) {
    const placed = infrastructureObject(
      track,
      object.id,
      object.kind,
      track.lengthMeters * object.fraction,
      object.side,
      object.offsetMeters,
      object.scale,
      object.visualStyle,
      object.rotationOffset,
      object.dimensions,
      occupied,
    )
    staticObjects.push(placed)
    const collider = orientedRectangle(
      placed.position,
      placed.rotation,
      placed.dimensions.lengthMeters,
      placed.dimensions.depthMeters,
    )
    occupied.push({ id: placed.id, collider, bounds: polygonBounds(collider) })
  }
  return {
    preset: track.sceneryLayout.preset,
    landmarks: [],
    staticObjects,
    escapeRoads: escapeRoadsFor(track.id),
    brakingMarkers: createBrakingMarkers(track),
  }
}

function createBrakingMarkers(track) {
  const markerProfiles = brakingMarkerProfileFor(track.id)
  const anchors = detectTurnAnchors(
    track,
    curbFidelityProfileFor(track.id).turnCount,
  )
  const markers = []

  for (const profile of markerProfiles) {
    const turn = anchors[profile.cornerIndex - 1]
    if (!turn) {
      throw new Error(
        `${track.id}: braking marker corner ${profile.cornerIndex} is not defined`,
      )
    }
    const side = turn.signedCurvature >= 0 ? 'right' : 'left'
    for (
      let distanceToCornerMeters = profile.maximumDistanceMeters;
      distanceToCornerMeters >= 50;
      distanceToCornerMeters -= 50
    ) {
      const trackDistanceMeters = moduloDistance(
        turn.distanceMeters - distanceToCornerMeters,
        track.lengthMeters,
      )
      const tangent = tangentAtDistance(
        track.centerline,
        trackDistanceMeters,
        track.lengthMeters,
      )
      const direction = side === 'left' ? 1 : -1
      const outward = {
        x: -tangent.y * direction,
        y: tangent.x * direction,
      }
      const face = barrierFacePoint(track, side, trackDistanceMeters)
      // Boards sit just track-side of the canonical protection face. This
      // keeps them readable beside the outer fence without placing scenery
      // behind a wall or introducing a collider into the runoff area.
      const position = {
        x: round(face.x - outward.x * 0.75),
        y: round(face.y - outward.y * 0.75),
      }
      markers.push({
        id: `turn-${profile.cornerIndex}-${distanceToCornerMeters}m`,
        cornerIndex: profile.cornerIndex,
        distanceToCornerMeters,
        trackDistanceMeters: round(trackDistanceMeters),
        side,
        position,
        rotation: round(Math.atan2(tangent.y, tangent.x), 6),
        elevationLayer: face.elevationLayer,
      })
    }
  }

  return markers
}

function createBaseTrackLimitsV2(track) {
  const segments = track.trackLimits.segments.map((segment) => {
    if (track.id === 'shanghai' && segment.index === shanghaiPitAdjacentTurnSegmentIndex) {
      if (
        segment.right.zones.length !== 2 ||
        segment.right.zones[0].surface !== 'asphalt' ||
        segment.right.zones[0].widthMeters !== 20 ||
        segment.right.zones[1].surface !== 'gravel' ||
        segment.right.zones[1].widthMeters !== 20 ||
        segment.right.barrier !== 'tyre-barrier'
      ) {
        throw new Error(
          'Unexpected Shanghai v1 inner Turn 1 source at track-limit segment 2',
        )
      }
      return {
        ...segment,
        right: {
          ...segment.right,
          zones: [
            { surface: 'asphalt', widthMeters: 4 },
            { surface: 'grass', widthMeters: 4 },
          ],
          barrier: 'guardrail',
        },
      }
    }

    if (track.id === 'monaco') {
      const widthMeters = monacoAdjacentArmRunoffOverrides[segment.index]
      if (widthMeters === undefined) return segment

      const [zone] = segment.left.zones
      if (
        segment.left.zones.length !== 1 ||
        zone.surface !== 'asphalt' ||
        zone.widthMeters !== 20
      ) {
        throw new Error(
          `Unexpected Monaco v1 runoff source at track-limit segment ${segment.index}`,
        )
      }

      return {
        ...segment,
        left: {
          ...segment.left,
          zones: [{ ...zone, widthMeters }],
        },
      }
    }

    return segment
  })
  return { ...track.trackLimits, segments }
}

function decorateTrackLimitsV2(track, trackLimits, staticObjects) {
  const fencedTrackLimits = addStructureSafetyFences(
    track,
    trackLimits,
    staticObjects,
  )
  const fenceVisualStyle = fenceVisualProfileFor(track.id)
  return {
    ...fencedTrackLimits,
    segments: fencedTrackLimits.segments.map((segment) => ({
      ...segment,
      left: segment.left.fence
        ? { ...segment.left, fenceVisualStyle }
        : segment.left,
      right: segment.right.fence
        ? { ...segment.right, fenceVisualStyle }
        : segment.right,
    })),
  }
}

function createTrackV2(track) {
  const infrastructure = infrastructureProfileFor(track.id)
  const baseTrackLimits = createBaseTrackLimitsV2(track)
  const rebasedBaseTrack = rebaseTrack(
    { ...track, trackLimits: baseTrackLimits, curbs: [] },
    infrastructure.startOffsetMeters ?? 0,
  )
  rebasedBaseTrack.barrierOpenings = barrierOpeningsFor(track.id)
  const authoredCurbs = createAuthoredCurbs(
    rebasedBaseTrack,
    curbFidelityProfileFor(track.id),
  )
  const rebasedTrack = {
    ...rebasedBaseTrack,
    curbs: mergeNearbyCurbs(rebasedBaseTrack, authoredCurbs),
  }
  // Scenery placement needs the canonical barrier faces before structure fences
  // are introduced. Rebuild both chunks and barriers after those final track-limit
  // splits so every published segment references the correct limit and chunk.
  const placementBarrierGeometry = createBarrierGeometry(rebasedTrack)
  const trackWithBarriers = {
    ...rebasedTrack,
    barrierGeometry: placementBarrierGeometry,
  }
  const sceneryLayout = createSceneryLayout(trackWithBarriers, infrastructure)
  const trackLimits = decorateTrackLimitsV2(
    rebasedTrack,
    rebasedTrack.trackLimits,
    sceneryLayout.staticObjects,
  )
  const chunks = createChunks(
    rebasedTrack.centerline,
    rebasedTrack.lengthMeters,
    trackLimits,
  )
  const barrierGeometry = createBarrierGeometry({
    ...rebasedTrack,
    trackLimits,
    chunks,
  })
  const v2Track = {
    ...rebasedTrack,
    trackLimits,
    chunks,
    startFinish: gateAtDistance(
      0,
      rebasedTrack.centerline,
      0,
      rebasedTrack.lengthMeters,
    ),
    gridSlots: createGridSlots(
      rebasedTrack.centerline,
      rebasedTrack.lengthMeters,
    ),
    checkpoints: Array.from({ length: 8 }, (_, index) =>
      gateAtDistance(
        index,
        rebasedTrack.centerline,
        (rebasedTrack.lengthMeters * (index + 1)) / 9,
        rebasedTrack.lengthMeters,
      ),
    ),
    pitLane: createPitLane(rebasedTrack, infrastructure),
    sceneryLayout,
    barrierGeometry,
  }
  const localTransformations = []
  if (track.id === 'monaco') {
    localTransformations.push(
      'In Monaco, the two coarse 20-meter left paved margins beside adjacent ' +
        'track arms are narrowed to 4 meters so the canonical barrier face cannot ' +
        'invade the neighboring roadway.',
    )
  }
  if (track.id === 'shanghai') {
    localTransformations.push(
      'In Shanghai, the inner Turn 1 margin is narrowed to the verified paved-and-grass ' +
        'strip so its barrier remains outside the authored pit corridor.',
    )
  }
  const clearanceTransformation = localTransformations.length > 0
    ? ` ${localTransformations.join(' ')}`
    : ''

  return {
    ...v2Track,
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: CATALOG_VERSION,
    physicsContractVersion: PHYSICS_CONTRACT_VERSION,
    barrierGeometry,
    source: {
      ...track.source,
      environmentReferences: [
        ...track.source.environmentReferences,
        ...infrastructureReferencesFor(track.id),
      ],
      transformation:
        `${track.source.transformation} Contract v2 derives each track-facing ` +
        'barrier polyline from the sampled centerline, local track half-width, ' +
        'and the audited runoff-zone widths in catalog 2026.5. Catalog 2026.7 ' +
        'smooths abrupt protection transitions, caps faces before adjacent same-level ' +
        'track arms, publishes continuous pit paths and removes provisional scenery. ' +
        'Catalog 2026.8 adds per-circuit pit architecture, major buildings, spectator ' +
        'grandstands and safety fencing, closes curb gaps only through continuous ' +
        'curvature and preserves the canonical racing geometry; ' +
        'barrier thickness extends away from the racing surface. Catalog 2026.9 ' +
        'authors curb presence, dimensions and outer paint per numbered corner, ' +
        'publishes measured pit and structure footprints, and represents the ' +
        'Rettifilo straight-ahead escape route with staggered visual block rows ' +
        'that do not participate in physics. It also uses Grand Prix Guides as a ' +
        'secondary satellite cross-check while FIA and circuit material remain primary, ' +
        'and records the last technically verifiable 2025 configuration for Mexico ' +
        'City and the latest official project for Madrid. Catalog 2026.10 publishes ' +
        'authored braking-reference boards only on material braking approaches and ' +
        'keeps their placement immediately track-side of the canonical outer protection; ' +
        'it also refines the Rettifilo escape corridor for uninterrupted clearance. ' +
        `${clearanceTransformation}`,
    },
  }
}

function createCatalogSchema(v1Schema) {
  const required = [...v1Schema.required]
  required.splice(required.indexOf('seasonReference'), 0, 'physicsContractVersion')
  if (!required.includes('calendarPolicy')) {
    required.splice(required.indexOf('tracks'), 0, 'calendarPolicy')
  }
  return {
    ...v1Schema,
    $id: 'https://never-lift.local/contracts/module-2/v2/track-catalog.schema.json',
    title: 'Never Lift Track Catalog v2',
    required,
    properties: {
      ...v1Schema.properties,
      schemaVersion: { const: SCHEMA_VERSION },
      catalogVersion: { const: CATALOG_VERSION },
      physicsContractVersion: { const: PHYSICS_CONTRACT_VERSION },
    },
  }
}

function createTrackSchema(v1Schema) {
  const required = [...v1Schema.required]
  required.splice(required.indexOf('id'), 0, 'physicsContractVersion')
  const sourceIndex = required.indexOf('source')
  required.splice(
    sourceIndex < 0 ? required.length : sourceIndex,
    0,
    'barrierOpenings',
    'barrierGeometry',
  )
  const pitLane = v1Schema.properties.pitLane
  const sceneryLayout = v1Schema.properties.sceneryLayout
  const sceneryObject = v1Schema.$defs.sceneryObject
  const curbSegment = v1Schema.$defs.curbSegment
  const trackSideEnvironment = v1Schema.$defs.trackSideEnvironment
  return {
    ...v1Schema,
    $id: 'https://never-lift.local/contracts/module-2/v2/track-definition.schema.json',
    title: 'Never Lift Track Definition v2',
    required,
    properties: {
      ...v1Schema.properties,
      schemaVersion: { const: SCHEMA_VERSION },
      catalogVersion: { const: CATALOG_VERSION },
      physicsContractVersion: { const: PHYSICS_CONTRACT_VERSION },
      pitLane: {
        ...pitLane,
        required: [...pitLane.required, 'visualStyle'],
        properties: {
          ...pitLane.properties,
          visualStyle: { $ref: '#/$defs/pitVisualStyle' },
        },
      },
      sceneryLayout: {
        ...sceneryLayout,
        required: [
          ...sceneryLayout.required,
          'escapeRoads',
          'brakingMarkers',
        ],
        properties: {
          ...sceneryLayout.properties,
          escapeRoads: {
            type: 'array',
            items: { $ref: '#/$defs/escapeRoad' },
          },
          brakingMarkers: {
            type: 'array',
            items: { $ref: '#/$defs/brakingMarker' },
          },
        },
      },
      barrierOpenings: {
        type: 'array',
        items: { $ref: '#/$defs/barrierOpening' },
      },
      barrierGeometry: { $ref: '#/$defs/barrierGeometry' },
    },
    $defs: {
      ...v1Schema.$defs,
      infrastructurePalette: {
        type: 'object',
        additionalProperties: false,
        required: [
          'primaryColor',
          'secondaryColor',
          'accentColor',
          'roofColor',
        ],
        properties: {
          primaryColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          secondaryColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          accentColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          roofColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        },
      },
      pitVisualStyle: {
        allOf: [
          { $ref: '#/$defs/infrastructurePalette' },
          {
            type: 'object',
            properties: {
              architecture: {
                enum: [
                  'temporary-modular',
                  'permanent-modern',
                  'desert-canopy',
                  'stepped-modern',
                  'urban-compact',
                  'wing',
                  'heritage',
                  'exhibition',
                  'stadium',
                  'marina-canopy',
                ],
              },
              garageCount: { type: 'integer', minimum: 8, maximum: 16 },
              buildingHeightMeters: {
                type: 'number',
                minimum: 3,
                maximum: 24,
              },
              laneWidthMeters: { type: 'number', minimum: 6, maximum: 16 },
              garageStartRatio: { type: 'number', minimum: 0.05, maximum: 0.8 },
              garageEndRatio: { type: 'number', minimum: 0.2, maximum: 0.95 },
              pitBoxLengthMeters: { type: 'number', minimum: 3, maximum: 12 },
              pitBoxDepthMeters: { type: 'number', minimum: 1.5, maximum: 4 },
              pitBoxCenterOffsetMeters: { type: 'number', minimum: 1, maximum: 5 },
              garageDepthMeters: { type: 'number', minimum: 3, maximum: 16 },
              garageCenterOffsetMeters: { type: 'number', minimum: 6, maximum: 24 },
              pitWallHeightMeters: { type: 'number', minimum: 0.6, maximum: 1.5 },
              canopyDepthMeters: { type: 'number', minimum: 0, maximum: 5 },
            },
            required: [
              'architecture',
              'garageCount',
              'buildingHeightMeters',
              'laneWidthMeters',
              'garageStartRatio',
              'garageEndRatio',
              'pitBoxLengthMeters',
              'pitBoxDepthMeters',
              'pitBoxCenterOffsetMeters',
              'garageDepthMeters',
              'garageCenterOffsetMeters',
              'pitWallHeightMeters',
              'canopyDepthMeters',
            ],
          },
        ],
        unevaluatedProperties: false,
      },
      sceneryObject: {
        ...sceneryObject,
        properties: {
          ...sceneryObject.properties,
          visualStyle: { $ref: '#/$defs/infrastructurePalette' },
          dimensions: { $ref: '#/$defs/infrastructureDimensions' },
        },
      },
      infrastructureDimensions: {
        type: 'object',
        additionalProperties: false,
        required: ['lengthMeters', 'depthMeters', 'heightMeters'],
        properties: {
          lengthMeters: { type: 'number', exclusiveMinimum: 0, maximum: 400 },
          depthMeters: { type: 'number', exclusiveMinimum: 0, maximum: 120 },
          heightMeters: { type: 'number', exclusiveMinimum: 0, maximum: 80 },
        },
      },
      escapeObstacleRow: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'blockLengthMeters', 'palette'],
        properties: {
          from: { $ref: '#/$defs/vector' },
          to: { $ref: '#/$defs/vector' },
          blockLengthMeters: { type: 'number', minimum: 0.4, maximum: 4 },
          palette: { enum: ['red-white', 'stone'] },
          collisionMaterial: { const: 'concrete-wall' },
        },
      },
      escapeRoad: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'kind',
          'affectsPhysics',
          'elevationLayer',
          'widthMeters',
          'path',
          'obstacleRows',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: { const: 'slalom-block-rows' },
          affectsPhysics: { type: 'boolean' },
          elevationLayer: { type: 'integer', minimum: 0, maximum: 3 },
          widthMeters: { type: 'number', minimum: 4, maximum: 16 },
          path: {
            type: 'array',
            minItems: 2,
            items: { $ref: '#/$defs/vector' },
          },
          obstacleRows: {
            type: 'array',
            minItems: 3,
            items: { $ref: '#/$defs/escapeObstacleRow' },
          },
          edgeMaterial: { const: 'concrete-wall' },
        },
      },
      brakingMarker: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'cornerIndex',
          'distanceToCornerMeters',
          'trackDistanceMeters',
          'side',
          'position',
          'rotation',
          'elevationLayer',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          cornerIndex: { type: 'integer', minimum: 1, maximum: 30 },
          distanceToCornerMeters: {
            enum: [50, 100, 150, 200, 250, 300],
          },
          trackDistanceMeters: { type: 'number', minimum: 0 },
          side: { enum: ['left', 'right'] },
          position: { $ref: '#/$defs/vector' },
          rotation: { type: 'number' },
          elevationLayer: { type: 'integer', minimum: 0, maximum: 3 },
        },
      },
      barrierOpening: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'side',
          'fromDistanceMeters',
          'toDistanceMeters',
          'reason',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          side: { enum: ['left', 'right'] },
          fromDistanceMeters: { type: 'number', minimum: 0 },
          toDistanceMeters: { type: 'number', exclusiveMinimum: 0 },
          reason: { const: 'escape-road-access' },
        },
      },
      curbSegment: {
        ...curbSegment,
        properties: {
          ...curbSegment.properties,
          outerColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          outerWidthMeters: { type: 'number', minimum: 0.1, maximum: 1.5 },
        },
      },
      fenceVisualStyle: {
        type: 'object',
        additionalProperties: false,
        required: [
          'heightMeters',
          'postSpacingMeters',
          'postColor',
          'meshColor',
          'meshOpacity',
          'cantileverMeters',
        ],
        properties: {
          heightMeters: { type: 'number', minimum: 2, maximum: 6 },
          postSpacingMeters: { type: 'number', minimum: 1.5, maximum: 5 },
          postColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          meshColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          meshOpacity: { type: 'number', minimum: 0.05, maximum: 0.5 },
          cantileverMeters: { type: 'number', minimum: 0, maximum: 1.2 },
        },
      },
      trackSideEnvironment: {
        ...trackSideEnvironment,
        properties: {
          ...trackSideEnvironment.properties,
          fenceVisualStyle: { $ref: '#/$defs/fenceVisualStyle' },
        },
      },
      barrierFacePoint: {
        type: 'object',
        additionalProperties: false,
        required: ['x', 'y', 'distanceMeters', 'elevationLayer'],
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          distanceMeters: { type: 'number', minimum: 0 },
          elevationLayer: { type: 'integer', minimum: 0, maximum: 3 },
        },
      },
      barrierSegment: {
        type: 'object',
        additionalProperties: false,
        required: [
          'index',
          'trackLimitSegmentIndex',
          'side',
          'fromDistanceMeters',
          'toDistanceMeters',
          'material',
          'thicknessMeters',
          'collisionLayer',
          'chunkIndexes',
          'path',
        ],
        properties: {
          index: { type: 'integer', minimum: 0 },
          trackLimitSegmentIndex: { type: 'integer', minimum: 0 },
          side: { enum: ['left', 'right'] },
          fromDistanceMeters: { type: 'number', minimum: 0 },
          toDistanceMeters: { type: 'number', exclusiveMinimum: 0 },
          material: {
            enum: ['concrete-wall', 'guardrail', 'tecpro', 'tyre-barrier'],
          },
          thicknessMeters: { type: 'number', exclusiveMinimum: 0, maximum: 2 },
          collisionLayer: { const: 'track-barrier' },
          chunkIndexes: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { type: 'integer', minimum: 0 },
          },
          path: {
            type: 'array',
            minItems: 2,
            items: { $ref: '#/$defs/barrierFacePoint' },
          },
        },
      },
      barrierGeometry: {
        type: 'object',
        additionalProperties: false,
        required: ['segments'],
        properties: {
          segments: {
            type: 'array',
            minItems: 2,
            items: { $ref: '#/$defs/barrierSegment' },
          },
        },
      },
    },
  }
}

async function writeJson(path, value) {
  const output = `${JSON.stringify(value, null, 2)}\n`
  if (checkOnly) {
    const current = await readFile(path, 'utf8')
    // Git may materialize tracked text as CRLF on Windows even though the
    // canonical blob uses LF. Reproducibility checks compare content while
    // the separate mirror audit remains responsible for byte identity.
    const normalizedCurrent = current.replace(/\r\n?/g, '\n')
    if (normalizedCurrent !== output) throw new Error(`Generated artifact is stale: ${path}`)
    return
  }
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, output, 'utf8')
  try {
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

await mkdir(resolve(v2Directory, 'tracks'), { recursive: true })

const [v1Catalog, v1CatalogSchema, v1TrackSchema] = await Promise.all([
  readFile(resolve(v1Directory, 'catalog.json'), 'utf8').then(JSON.parse),
  readFile(resolve(v1Directory, 'track-catalog.schema.json'), 'utf8').then(JSON.parse),
  readFile(resolve(v1Directory, 'track-definition.schema.json'), 'utf8').then(JSON.parse),
])

const catalog = {
  ...v1Catalog,
  schemaVersion: SCHEMA_VERSION,
  catalogVersion: CATALOG_VERSION,
  physicsContractVersion: PHYSICS_CONTRACT_VERSION,
}

await Promise.all([
  writeJson(resolve(v2Directory, 'catalog.json'), catalog),
  writeJson(
    resolve(v2Directory, 'track-catalog.schema.json'),
    createCatalogSchema(v1CatalogSchema),
  ),
  writeJson(
    resolve(v2Directory, 'track-definition.schema.json'),
    createTrackSchema(v1TrackSchema),
  ),
  ...catalog.tracks.map(async (entry) => {
    const track = JSON.parse(
      await readFile(resolve(v1Directory, entry.definitionPath), 'utf8'),
    )
    await writeJson(resolve(v2Directory, entry.definitionPath), createTrackV2(track))
  }),
])

console.log(
  checkOnly
    ? `Contract ${SCHEMA_VERSION} / catalog ${CATALOG_VERSION} is reproducible.`
    : `Generated contract ${SCHEMA_VERSION} / catalog ${CATALOG_VERSION}.`,
)
