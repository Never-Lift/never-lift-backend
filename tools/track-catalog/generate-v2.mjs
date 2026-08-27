import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  infrastructureProfileFor,
  infrastructureReferencesFor,
} from './track-infrastructure-v2.mjs'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..', '..')
const v1Directory = resolve(repositoryRoot, 'contracts', 'module-2', 'v1')
const v2Directory = resolve(repositoryRoot, 'contracts', 'module-2', 'v2')
const checkOnly = process.argv.includes('--check')

const SCHEMA_VERSION = '2.0.0'
const CATALOG_VERSION = '2026.8'
const PHYSICS_CONTRACT_VERSION = '2.0.0'
const ROUND_DECIMALS = 3
const CHUNK_LENGTH_METERS = 250
const BARRIER_TRANSITION_RADIUS_METERS = 24
const ADJACENT_ARM_LONGITUDINAL_WINDOW_METERS = 28
const ADJACENT_ARM_CLEARANCE_METERS = 2.5
const CURB_CONTINUITY_GAP_METERS = 18
const GRANDSTAND_FENCE_MARGIN_METERS = 54

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

function smoothedBarrierFaceOffset(track, side, distanceMeters) {
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
  return adjacentArmSafeOffset(track, side, distanceMeters, desired)
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

function createBarrierGeometry(track) {
  const segments = []
  for (const trackLimitSegment of track.trackLimits.segments) {
    for (const side of ['left', 'right']) {
      const sideEnvironment = trackLimitSegment[side]
      const distances = distancesForSegment(track, trackLimitSegment)
      const path = distances.map((distanceMeters) =>
        barrierFacePoint(track, side, distanceMeters),
      )
      for (const layerPath of splitPathByElevationLayer(path)) {
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

function canBridgeCurbGap(track, previous, next) {
  const gap = next.fromDistanceMeters - previous.toDistanceMeters
  if (gap < -1e-6 || gap > CURB_CONTINUITY_GAP_METERS) return false
  if (gap <= 7) return true

  const samples = [
    previous.toDistanceMeters - 4,
    previous.toDistanceMeters + gap * 0.25,
    previous.toDistanceMeters + gap * 0.5,
    previous.toDistanceMeters + gap * 0.75,
    next.fromDistanceMeters + 4,
  ].map((distanceMeters) => signedTurnAtDistance(track, distanceMeters))
  const meaningful = samples.filter((value) => Math.abs(value) >= 0.0015)
  if (meaningful.length < 3) return false
  const direction = Math.sign(meaningful[0])
  return meaningful.every((value) => Math.sign(value) === direction)
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
  return merged
    .sort(
      (first, second) =>
        first.fromDistanceMeters - second.fromDistanceMeters ||
        first.side.localeCompare(second.side),
    )
    .map((curb, index) => ({ ...curb, index }))
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

function addStructureSafetyFences(track, trackLimits, profile) {
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

  const ranges = profile.structures
    .filter((object) => object.kind.includes('grandstand'))
    .flatMap((object) => {
      const center = track.lengthMeters * object.fraction
      const margin = Math.max(
        GRANDSTAND_FENCE_MARGIN_METERS,
        object.scale * 4.5,
      )
      return splitWrappedFenceRange(
        center - margin,
        center + margin,
        track.lengthMeters,
      ).map((range) => ({ ...range, side: object.side }))
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
    const merge = Math.sin(Math.PI * progress) ** 0.72
    const offset =
      (point.halfWidthMeters + profile.pitOffsetMeters) *
      sideDirection *
      merge
    return {
      x: round(point.x + normal.x * offset),
      y: round(point.y + normal.y * offset),
    }
  })
  return {
    entryDistanceMeters,
    exitDistanceMeters,
    speedLimitMetersPerSecond: 22.222,
    path,
    visualStyle: profile.pitVisual,
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
) {
  const point = sampleAtDistance(track.centerline, distanceMeters, track.lengthMeters)
  const tangent = tangentAtDistance(track.centerline, distanceMeters, track.lengthMeters)
  const normal = { x: -tangent.y, y: tangent.x }
  const sideDirection = side === 'left' ? 1 : -1
  return {
    id,
    kind,
    position: {
      x: round(point.x + normal.x * sideDirection * (point.halfWidthMeters + offset)),
      y: round(point.y + normal.y * sideDirection * (point.halfWidthMeters + offset)),
    },
    rotation: round(Math.atan2(tangent.y, tangent.x) + rotationOffset, 6),
    scale,
    ...(visualStyle ? { visualStyle } : {}),
  }
}

function createSceneryLayout(track, profile) {
  const start = track.centerline[0]
  const tangent = tangentAtDistance(track.centerline, 0, track.lengthMeters)
  const staticObjects = [
    {
      id: 'start-gantry',
      kind: 'start-gantry',
      position: { x: round(start.x), y: round(start.y) },
      rotation: round(Math.atan2(tangent.y, tangent.x), 6),
      scale: round(start.halfWidthMeters * 2.2),
    },
    ...profile.structures.map((object) =>
      infrastructureObject(
        track,
        object.id,
        object.kind,
        track.lengthMeters * object.fraction,
        object.side,
        object.offsetMeters,
        object.scale,
        object.visualStyle,
        object.rotationOffset,
      ),
    ),
  ]
  if (track.id === 'monza') {
    const obstacleDistance = 430
    for (let index = -2; index <= 2; index += 1) {
      staticObjects.push(
        infrastructureObject(
          track,
          `rettifilo-escape-bollard-${index + 3}`,
          'escape-bollard',
          obstacleDistance + index * 2.4,
          index % 2 === 0 ? 'left' : 'right',
          8 + Math.abs(index) * 0.7,
          1.1,
        ),
      )
    }
  }
  return {
    preset: track.sceneryLayout.preset,
    landmarks: [],
    staticObjects,
  }
}

function createTrackLimitsV2(track, profile) {
  const clearedTrackLimits = track.id !== 'monaco'
    ? track.trackLimits
    : {
      ...track.trackLimits,
      segments: track.trackLimits.segments.map((segment) => {
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
      }),
    }
  return addStructureSafetyFences(track, clearedTrackLimits, profile)
}

function createTrackV2(track) {
  const infrastructure = infrastructureProfileFor(track.id)
  const trackLimits = createTrackLimitsV2(track, infrastructure)
  const rebasedTrack = rebaseTrack(
    { ...track, trackLimits },
    infrastructure.startOffsetMeters ?? 0,
  )
  const v2Track = {
    ...rebasedTrack,
    curbs: mergeNearbyCurbs(rebasedTrack, rebasedTrack.curbs),
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
    sceneryLayout: createSceneryLayout(rebasedTrack, infrastructure),
  }
  const clearanceTransformation =
    track.id === 'monaco'
      ? ' In Monaco, the two coarse 20-meter left paved margins beside adjacent ' +
        'track arms are narrowed to 4 meters so the canonical barrier face cannot ' +
        'invade the neighboring roadway.'
      : ''

  return {
    ...v2Track,
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: CATALOG_VERSION,
    physicsContractVersion: PHYSICS_CONTRACT_VERSION,
    barrierGeometry: createBarrierGeometry(v2Track),
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
        `barrier thickness extends away from the racing surface.${clearanceTransformation}`,
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
  required.splice(sourceIndex < 0 ? required.length : sourceIndex, 0, 'barrierGeometry')
  const pitLane = v1Schema.properties.pitLane
  const sceneryObject = v1Schema.$defs.sceneryObject
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
                maximum: 8,
              },
            },
            required: [
              'architecture',
              'garageCount',
              'buildingHeightMeters',
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
  await writeFile(path, output, 'utf8')
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
