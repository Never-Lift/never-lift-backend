function round(value, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function sampleAtDistance(track, targetDistanceMeters) {
  const clampedDistance = Math.max(0, Math.min(track.lengthMeters, targetDistanceMeters))
  const centerline = track.centerline
  for (let index = 0; index < centerline.length - 1; index += 1) {
    const from = centerline[index]
    const to = centerline[index + 1]
    if (clampedDistance > to.distanceMeters) continue
    const span = Math.max(to.distanceMeters - from.distanceMeters, 1e-9)
    const ratio = (clampedDistance - from.distanceMeters) / span
    return {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    }
  }
  return { ...centerline.at(-1) }
}

function tangentAtDistance(track, targetDistanceMeters) {
  const before = sampleAtDistance(track, targetDistanceMeters - 20)
  const after = sampleAtDistance(track, targetDistanceMeters + 20)
  const length = Math.max(
    Math.hypot(after.x - before.x, after.y - before.y),
    1e-9,
  )
  return {
    x: (after.x - before.x) / length,
    y: (after.y - before.y) / length,
  }
}

function createRettifiloEscapePath(track) {
  const entryDistanceMeters = 440
  const exitDistanceMeters = 590
  const entry = sampleAtDistance(track, entryDistanceMeters)
  const tangent = tangentAtDistance(track, entryDistanceMeters)
  const entryNormal = { x: -tangent.y, y: tangent.x }
  const trackHalfWidthMeters = 5.5
  const escapeCenterOffsetMeters = trackHalfWidthMeters + 0.25
  const escapeEntry = {
    x: entry.x + entryNormal.x * escapeCenterOffsetMeters,
    y: entry.y + entryNormal.y * escapeCenterOffsetMeters,
  }
  const straightPoints = [0, 25, 50, 75, 95].map((distanceMeters) => ({
    x: escapeEntry.x + tangent.x * distanceMeters,
    y: escapeEntry.y + tangent.y * distanceMeters,
  }))
  const straightEnd = straightPoints.at(-1)
  const exit = sampleAtDistance(track, exitDistanceMeters)
  const exitTangent = tangentAtDistance(track, exitDistanceMeters)
  const exitNormal = { x: -exitTangent.y, y: exitTangent.x }
  const escapeExit = {
    x: exit.x + exitNormal.x * escapeCenterOffsetMeters,
    y: exit.y + exitNormal.y * escapeCenterOffsetMeters,
  }
  const transitionPoints = [0.35, 0.7].map((ratio) => ({
    x: straightEnd.x + (escapeExit.x - straightEnd.x) * ratio,
    y: straightEnd.y + (escapeExit.y - straightEnd.y) * ratio,
  }))
  return Object.freeze(
    [...straightPoints, ...transitionPoints, escapeExit].map((point) =>
      Object.freeze({ x: round(point.x), y: round(point.y) }),
    ),
  )
}

function pointOnPolyline(path, distanceRatio) {
  const clampedRatio = Math.max(0, Math.min(1, distanceRatio))
  const lengths = path.slice(1).map((point, index) =>
    Math.hypot(point.x - path[index].x, point.y - path[index].y),
  )
  const totalLength = lengths.reduce((sum, length) => sum + length, 0)
  let remaining = totalLength * clampedRatio
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]
    if (remaining <= length || index === lengths.length - 1) {
      const from = path[index]
      const to = path[index + 1]
      const ratio = length <= 1e-9 ? 0 : remaining / length
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
        tangent: {
          x: (to.x - from.x) / Math.max(length, 1e-9),
          y: (to.y - from.y) / Math.max(length, 1e-9),
        },
      }
    }
    remaining -= length
  }
  return { ...path.at(-1), tangent: { x: 1, y: 0 } }
}

function createRettifiloObstacleRows(rettifiloEscapePath) {
  return Object.freeze(
    [
      [0.4, 1.45],
      [0.5, -1.45],
      [0.6, 1.45],
      [0.7, -1.45],
      [0.82, 1.45],
    ].map(([ratio, lateralOffset]) => {
      const { x, y, tangent } = pointOnPolyline(rettifiloEscapePath, ratio)
      const normal = { x: -tangent.y, y: tangent.x }
      const halfLength = 3.1
      const center = {
        x: x + normal.x * lateralOffset,
        y: y + normal.y * lateralOffset,
      }
      return Object.freeze({
        from: Object.freeze({
          x: round(center.x - normal.x * halfLength),
          y: round(center.y - normal.y * halfLength),
        }),
        to: Object.freeze({
          x: round(center.x + normal.x * halfLength),
          y: round(center.y + normal.y * halfLength),
        }),
        blockLengthMeters: 1.05,
        palette: 'white-red-chevron',
        collisionMaterial: 'concrete-wall',
      })
    }),
  )
}

function createMonzaRettifiloSlalom(track) {
  const path = createRettifiloEscapePath(track)
  return Object.freeze({
    id: 'rettifilo-slalom',
    kind: 'slalom-block-rows',
    affectsPhysics: true,
    elevationLayer: 0,
    widthMeters: 10.5,
    edgeMaterial: 'concrete-wall',
    edgeSides: Object.freeze(['left']),
    path,
    obstacleRows: createRettifiloObstacleRows(path),
  })
}

const barrierOpeningsByTrack = Object.freeze({
  monza: Object.freeze([
    Object.freeze({
      id: 'rettifilo-escape-access',
      side: 'left',
      fromDistanceMeters: 440,
      toDistanceMeters: 590,
      reason: 'escape-road-access',
    }),
  ]),
})

/**
 * The Rettifilo escape corridor was a temporary experiment in catalog 2026.11.
 * It is intentionally removed from the executable catalog: the canonical
 * Monza definition must again expose only the main-track surfaces and its
 * audited external protection.  Keeping these helpers as no-ops preserves the
 * generic schema/API shape for future authored escape routes without leaking
 * the provisional geometry into runtime physics or rendering.
 */
export function escapeRoadsFor(_track) {
  return []
}

export function barrierOpeningsFor(_trackId) {
  return []
}
