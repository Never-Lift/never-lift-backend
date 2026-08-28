const rettifiloEscapePath = Object.freeze([
  // The real escape lane leaves the left side of the Rettifilo approach,
  // stays straight alongside the chicane, and rejoins at the far end.  The
  // path is deliberately kept on the outside of the canonical left barrier;
  // the opening below is what connects it to the racing surface.
  Object.freeze({ x: 31.862, y: 613.914 }),
  Object.freeze({ x: 40.501, y: 632.356 }),
  Object.freeze({ x: 49.186, y: 651.608 }),
  Object.freeze({ x: 57.891, y: 670.241 }),
])

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

const rettifiloObstacleRows = Object.freeze(
  [
    [0.2, 0.9],
    [0.36, -0.9],
    [0.52, 0.9],
    [0.68, -0.9],
    [0.84, 0.9],
  ].map(([ratio, lateralOffset]) => {
    const { x, y, tangent } = pointOnPolyline(rettifiloEscapePath, ratio)
    const normal = { x: -tangent.y, y: tangent.x }
    const halfLength = 2.35
    const center = {
      x: x + normal.x * lateralOffset,
      y: y + normal.y * lateralOffset,
    }
    return Object.freeze({
      from: Object.freeze({
        x: center.x - normal.x * halfLength,
        y: center.y - normal.y * halfLength,
      }),
      to: Object.freeze({
        x: center.x + normal.x * halfLength,
        y: center.y + normal.y * halfLength,
      }),
      blockLengthMeters: 0.9,
      palette: 'stone',
      collisionMaterial: 'concrete-wall',
    })
  }),
)

const monzaRettifiloSlalom = Object.freeze({
  id: 'rettifilo-slalom',
  kind: 'slalom-block-rows',
  affectsPhysics: true,
  elevationLayer: 0,
  widthMeters: 7,
  edgeMaterial: 'concrete-wall',
  path: rettifiloEscapePath,
  obstacleRows: rettifiloObstacleRows,
})

const escapeRoadsByTrack = Object.freeze({
  monza: Object.freeze([monzaRettifiloSlalom]),
})

const barrierOpeningsByTrack = Object.freeze({
  monza: Object.freeze([
    Object.freeze({
      id: 'rettifilo-escape-access',
      side: 'left',
      fromDistanceMeters: 463.44,
      toDistanceMeters: 566,
      reason: 'escape-road-access',
    }),
  ]),
})

export function escapeRoadsFor(trackId) {
  return structuredClone(escapeRoadsByTrack[trackId] ?? [])
}

export function barrierOpeningsFor(trackId) {
  return structuredClone(barrierOpeningsByTrack[trackId] ?? [])
}
