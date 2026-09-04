import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..', '..')
const contractDirectory = resolve(repositoryRoot, 'contracts', 'module-2', 'v2')
const mirrorFlag = process.argv.indexOf('--mirror')
const mirrorDirectory =
  mirrorFlag >= 0 ? resolve(repositoryRoot, process.argv[mirrorFlag + 1]) : null

const VERSION = '2.0.0'
const CATALOG_VERSION = '2026.12'
const PHYSICS_VERSION = '2.0.2'
const TRACK_COUNT = 24
const sharedFiles = [
  'README.md',
  'module-2-decisions.json',
  'physics-model.md',
  'physics-constants.schema.json',
  'physics-constants.json',
  'vehicle-definition.schema.json',
  'vehicle-definition.json',
  'physics-reference-scenarios.schema.json',
  'physics-reference-scenarios.json',
  'realtime-race-protocol.schema.json',
  'track-catalog.schema.json',
  'catalog.json',
  'track-definition.schema.json',
]

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

async function json(relativePath) {
  return JSON.parse(await readFile(resolve(contractDirectory, relativePath), 'utf8'))
}

function polygonArea(vertices) {
  return vertices.reduce((total, point, index) => {
    const next = vertices[(index + 1) % vertices.length]
    return total + point.x * next.y - point.y * next.x
  }, 0) / 2
}

function isConvex(vertices) {
  let sign = 0
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]
    const b = vertices[(index + 1) % vertices.length]
    const c = vertices[(index + 2) % vertices.length]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) <= 1e-9) continue
    const nextSign = Math.sign(cross)
    if (sign !== 0 && sign !== nextSign) return false
    sign = nextSign
  }
  return sign !== 0
}

function validateRaceConstants(constants) {
  const expected = {
    jumpStartThrottleThreshold: 0.05,
    jumpStartLockSeconds: 5,
    gridGapMeters: 8,
    checkpointGateMarginMeters: 2,
    pitSpeedLimitMetersPerSecond: 22.2222222222,
    pitLaneHalfWidthMeters: 3,
    minimumRaceDurationSeconds: 180,
    raceDurationReferenceSpeedMetersPerSecond: 12,
    progressProjectionMarginMeters: 30,
    startLightCount: 5,
    startLightStageSeconds: 1,
    lightsOutDelaySeconds: 1,
    localProjectionWindowMeters: 40,
    localProjectionRecoveryMarginMeters: 24,
    projectionDistanceToleranceMeters: 0.5,
    barrierBroadphaseCellMeters: 64,
  }
  const race = constants.race
  invariant(Boolean(race), 'race constants')
  invariant(
    JSON.stringify(Object.keys(race).sort()) ===
      JSON.stringify(Object.keys(expected).sort()),
    'race constants exact keys',
  )

  for (const [key, expectedValue] of Object.entries(expected)) {
    invariant(Number.isFinite(race[key]), `race ${key} must be finite`)
    invariant(race[key] === expectedValue, `race ${key}`)
  }
  invariant(
    race.jumpStartThrottleThreshold >= 0 &&
      race.jumpStartThrottleThreshold <= 1,
    'jump-start throttle threshold range',
  )
  invariant(Number.isInteger(race.startLightCount), 'start light count integer')
  invariant(race.startLightCount > 0, 'start light count positive')
  invariant(race.startLightStageSeconds > 0, 'start light stage duration')
  invariant(race.lightsOutDelaySeconds >= 0, 'lights-out delay')
  invariant(race.pitLaneHalfWidthMeters > 0, 'pit-lane half width')
  invariant(race.minimumRaceDurationSeconds > 0, 'minimum race duration')
  invariant(
    race.raceDurationReferenceSpeedMetersPerSecond > 0,
    'race-duration reference speed',
  )
  invariant(
    race.localProjectionRecoveryMarginMeters <=
      race.localProjectionWindowMeters,
    'projection recovery margin must fit in the local window',
  )
  invariant(
    race.projectionDistanceToleranceMeters > 0 &&
      race.projectionDistanceToleranceMeters <
        race.localProjectionRecoveryMarginMeters,
    'projection tolerance range',
  )
  invariant(
    race.barrierBroadphaseCellMeters > race.localProjectionWindowMeters,
    'barrier broadphase cell must cover the local projection window',
  )
}

function validateBotPlanner(constants) {
  const plannerRanges = {
    steeringLookAheadBaseMeters: [0, 250],
    steeringLookAheadSpeedSeconds: [0, 10],
    steeringLookAheadReactionReferenceSeconds: [0, 10],
    steeringLookAheadReactionGainMetersPerSecond: [0, 250],
    steeringNoiseFrequencyRadiansPerSecond: [0, 20],
    brakingLookAheadBaseMeters: [0, 250],
    brakingLookAheadSpeedSeconds: [0, 10],
    brakingLookAheadRecoveryGainSeconds: [0, 10],
    brakingPreviewSampleCount: [1, 32],
    racingLineSpeedFactorExponent: [Number.MIN_VALUE, 4],
    terminalSpeedTargetMultiplier: [0, 1],
    brakeHeadingErrorThresholdRadians: [Number.MIN_VALUE, Math.PI],
    maximumBrakeBase: [0, 1],
    maximumBrakeRecoveryGain: [0, 1],
    brakingRecoveryThrottle: [0, 1],
    brakingTrackThrottle: [0, 1],
    recoveryThrottleMultiplier: [0, 1],
    trackThrottleMultiplier: [0, 1],
    brakeDemandBase: [0, 1],
    brakeDemandSpeedScaleMetersPerSecond: [Number.MIN_VALUE, 200],
    steeringFullScaleHeadingErrorRadians: [Number.MIN_VALUE, Math.PI],
  }
  const planner = constants.bots?.planner
  invariant(Boolean(planner), 'bot planner constants')
  invariant(
    JSON.stringify(Object.keys(planner).sort()) ===
      JSON.stringify(Object.keys(plannerRanges).sort()),
    'bot planner exact keys',
  )

  for (const [key, [minimum, maximum]] of Object.entries(plannerRanges)) {
    const value = planner[key]
    invariant(Number.isFinite(value), `bot planner ${key} must be finite`)
    invariant(
      value >= minimum && value <= maximum,
      `bot planner ${key} range`,
    )
  }
  invariant(
    Number.isInteger(planner.brakingPreviewSampleCount),
    'bot planner braking preview sample count must be an integer',
  )
  invariant(
    planner.maximumBrakeBase + planner.maximumBrakeRecoveryGain <= 1,
    'bot planner maximum brake composition',
  )

  const difficultyRanges = {
    paceMultiplier: [Number.MIN_VALUE, 1],
    brakingSafetyMultiplier: [1, Number.POSITIVE_INFINITY],
    steeringNoise: [0, Number.POSITIVE_INFINITY],
    steeringLookAheadPenaltySeconds: [0, Number.POSITIVE_INFINITY],
    recoveryMultiplier: [Number.MIN_VALUE, 1],
  }
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const settings = constants.bots[difficulty]
    invariant(Boolean(settings), `bot difficulty ${difficulty}`)
    invariant(
      JSON.stringify(Object.keys(settings).sort()) ===
        JSON.stringify(Object.keys(difficultyRanges).sort()),
      `bot difficulty ${difficulty} exact keys`,
    )
    invariant(
      !Object.hasOwn(settings, 'consistency'),
      `bot difficulty ${difficulty} must not define consistency`,
    )
    invariant(
      !Object.hasOwn(settings, 'reactionDelaySeconds'),
      `bot difficulty ${difficulty} must not define reactionDelaySeconds`,
    )
    for (const [key, [minimum, maximum]] of Object.entries(difficultyRanges)) {
      const value = settings[key]
      invariant(Number.isFinite(value), `bot ${difficulty} ${key} must be finite`)
      invariant(
        value >= minimum && value <= maximum,
        `bot ${difficulty} ${key} range`,
      )
    }
  }

  const easy = constants.bots.easy
  const normal = constants.bots.normal
  const hard = constants.bots.hard
  invariant(easy.paceMultiplier < normal.paceMultiplier, 'easy bot pace ordering')
  invariant(normal.paceMultiplier < hard.paceMultiplier, 'hard bot pace ordering')
  invariant(
    easy.brakingSafetyMultiplier > normal.brakingSafetyMultiplier &&
      normal.brakingSafetyMultiplier > hard.brakingSafetyMultiplier,
    'bot braking safety ordering',
  )
  invariant(
    easy.steeringNoise > normal.steeringNoise &&
      normal.steeringNoise > hard.steeringNoise,
    'bot steering noise ordering',
  )
  invariant(
    easy.steeringLookAheadPenaltySeconds >
      normal.steeringLookAheadPenaltySeconds &&
      normal.steeringLookAheadPenaltySeconds >
        hard.steeringLookAheadPenaltySeconds,
    'bot steering look-ahead penalty ordering',
  )
  invariant(
    easy.recoveryMultiplier < normal.recoveryMultiplier &&
      normal.recoveryMultiplier < hard.recoveryMultiplier,
    'bot recovery ordering',
  )
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
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
    halfWidthMeters:
      start.halfWidthMeters +
      (end.halfWidthMeters - start.halfWidthMeters) * ratio,
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
  return normalize({ x: after.x - before.x, y: after.y - before.y })
}

function angleDifference(first, second) {
  let difference = Math.abs(first - second) % (Math.PI * 2)
  if (difference > Math.PI) difference = Math.PI * 2 - difference
  return difference
}

function projectPointToPolyline(point, path) {
  let best
  let shortestSquaredDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index]
    const to = path[index + 1]
    const segment = { x: to.x - from.x, y: to.y - from.y }
    const lengthSquared = segment.x * segment.x + segment.y * segment.y
    if (lengthSquared <= 1e-9) continue
    const ratio = Math.max(
      0,
      Math.min(
        1,
        ((point.x - from.x) * segment.x +
          (point.y - from.y) * segment.y) / lengthSquared,
      ),
    )
    const projection = {
      x: from.x + segment.x * ratio,
      y: from.y + segment.y * ratio,
    }
    const delta = { x: point.x - projection.x, y: point.y - projection.y }
    const squaredDistance = delta.x * delta.x + delta.y * delta.y
    if (squaredDistance >= shortestSquaredDistance) continue
    const tangent = normalize(segment)
    shortestSquaredDistance = squaredDistance
    best = {
      distanceMeters: Math.sqrt(squaredDistance),
      lateralMeters: tangent.x * delta.y - tangent.y * delta.x,
    }
  }
  return best
}

function validateEscapeRoads(track, entry) {
  const roads = track.sceneryLayout.escapeRoads
  invariant(Array.isArray(roads), `${entry.id} escape roads collection`)
  // No executable escape road is published in catalog 2026.12.  The previous
  // Monza Rettifilo corridor was provisional and is intentionally gone.
  invariant(roads.length === 0, `${entry.id} has no authored slalom escape road`)
  return

  /* istanbul ignore next -- retained below as documentation for future routes */
  const allIds = new Set([
    ...track.sceneryLayout.landmarks.map((object) => object.id),
    ...track.sceneryLayout.staticObjects.map((object) => object.id),
    ...track.sceneryLayout.brakingMarkers.map((marker) => marker.id),
  ])
  invariant(
    !track.sceneryLayout.staticObjects.some(
      (object) => object.kind === 'escape-bollard',
    ),
    `${entry.id} obsolete escape bollards removed`,
  )

  for (const road of roads) {
    invariant(typeof road.id === 'string' && road.id.length > 0, `${entry.id} escape road id`)
    invariant(!allIds.has(road.id), `${entry.id} unique escape road id`)
    allIds.add(road.id)
    invariant(road.kind === 'slalom-block-rows', `${entry.id} escape road kind`)
    invariant(
      typeof road.affectsPhysics === 'boolean',
      `${entry.id} escape road physics flag`,
    )
    invariant(
      entry.id === 'monza' ? road.affectsPhysics === true : road.affectsPhysics === false,
      `${entry.id} escape road physics assignment`,
    )
    if (road.affectsPhysics) {
      invariant(
        road.edgeMaterial === 'concrete-wall',
        `${entry.id} physical escape road edge material`,
      )
      invariant(
        Array.isArray(road.edgeSides) &&
          road.edgeSides.length >= 1 &&
          road.edgeSides.length <= 2 &&
          new Set(road.edgeSides).size === road.edgeSides.length &&
          road.edgeSides.every((side) => side === 'left' || side === 'right'),
        `${entry.id} physical escape road edge sides`,
      )
    }
    invariant(
      Number.isInteger(road.elevationLayer) &&
        road.elevationLayer >= 0 && road.elevationLayer <= 3,
      `${entry.id} escape road elevation layer`,
    )
    invariant(
      Number.isFinite(road.widthMeters) &&
        road.widthMeters >= 4 && road.widthMeters <= 16,
      `${entry.id} escape road width`,
    )
    invariant(Array.isArray(road.path) && road.path.length >= 2, `${entry.id} escape road path`)
    invariant(
      road.path.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
      `${entry.id} escape road finite path`,
    )
    invariant(
      Array.isArray(road.obstacleRows) && road.obstacleRows.length >= 3,
      `${entry.id} escape road obstacle rows`,
    )
    const rowLateralSigns = []
    for (const row of road.obstacleRows) {
      invariant(
        row.palette === 'white-red-chevron',
        `${entry.id} escape row palette`,
      )
      if (road.affectsPhysics) {
        invariant(
          row.palette === 'white-red-chevron',
          `${entry.id} physical escape row palette`,
        )
        invariant(
          row.collisionMaterial === 'concrete-wall',
          `${entry.id} physical escape row material`,
        )
      }
      invariant(
        Number.isFinite(row.blockLengthMeters) &&
          row.blockLengthMeters >= 0.4 && row.blockLengthMeters <= 4,
        `${entry.id} escape row block length`,
      )
      const fromProjection = projectPointToPolyline(row.from, road.path)
      const toProjection = projectPointToPolyline(row.to, road.path)
      invariant(Boolean(fromProjection) && Boolean(toProjection), `${entry.id} escape row projection`)
      invariant(
        fromProjection.distanceMeters <= road.widthMeters / 2 + 0.1 &&
          toProjection.distanceMeters <= road.widthMeters / 2 + 0.1,
        `${entry.id} escape row stays inside its paved corridor`,
      )
      const midpointProjection = projectPointToPolyline(
        {
          x: (row.from.x + row.to.x) / 2,
          y: (row.from.y + row.to.y) / 2,
        },
        road.path,
      )
      invariant(
        Math.abs(midpointProjection.lateralMeters) >= 0.35,
        `${entry.id} escape row leaves a real side opening`,
      )
      rowLateralSigns.push(Math.sign(midpointProjection.lateralMeters))
      if (road.affectsPhysics) {
        const fromTrack = projectPointToPolyline(row.from, track.centerline)
        const toTrack = projectPointToPolyline(row.to, track.centerline)
        invariant(
          fromTrack.distanceMeters >= 15 && toTrack.distanceMeters >= 15,
          `${entry.id} physical escape row outside racing surface`,
        )
      }
    }
    for (let index = 1; index < rowLateralSigns.length; index += 1) {
      invariant(
        rowLateralSigns[index] !== rowLateralSigns[index - 1],
        `${entry.id} escape row openings alternate`,
      )
    }
  }

}

function properSegmentsIntersect(a, b, c, d) {
  const cross = (origin, first, second) =>
    (first.x - origin.x) * (second.y - origin.y) -
    (first.y - origin.y) * (second.x - origin.x)
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return abC * abD < -1e-8 && cdA * cdB < -1e-8
}

function validateBrakingMarkers(track, entry) {
  const markers = track.sceneryLayout.brakingMarkers
  invariant(Array.isArray(markers), `${entry.id} braking marker collection`)
  invariant(markers.length >= 4, `${entry.id} meaningful braking marker coverage`)
  const ids = new Set()
  const byCorner = new Map()
  const allowedDistances = new Set([50, 100, 150, 200, 250, 300])

  for (const marker of markers) {
    invariant(typeof marker.id === 'string' && marker.id.length > 0, `${entry.id} braking marker id`)
    invariant(!ids.has(marker.id), `${entry.id} unique braking marker id`)
    ids.add(marker.id)
    invariant(
      Number.isInteger(marker.cornerIndex) && marker.cornerIndex >= 1,
      `${entry.id} braking marker corner`,
    )
    invariant(
      allowedDistances.has(marker.distanceToCornerMeters),
      `${entry.id} braking marker distance`,
    )
    invariant(
      marker.trackDistanceMeters >= 0 && marker.trackDistanceMeters < track.lengthMeters,
      `${entry.id} braking marker track distance`,
    )
    invariant(marker.side === 'left' || marker.side === 'right', `${entry.id} braking marker side`)
    invariant(
      Number.isFinite(marker.position.x) && Number.isFinite(marker.position.y),
      `${entry.id} braking marker position`,
    )
    invariant(Number.isFinite(marker.rotation), `${entry.id} braking marker rotation`)
    const barrier = track.barrierGeometry.segments.find(
      (segment) =>
        segment.side === marker.side &&
        marker.trackDistanceMeters >= segment.fromDistanceMeters - 0.001 &&
        marker.trackDistanceMeters <= segment.toDistanceMeters + 0.001,
    )
    if (!barrier) {
      const isPitTransition = track.barrierOpenings.some(
        (opening) =>
          opening.side === marker.side &&
          (opening.reason === 'pit-entry' || opening.reason === 'pit-exit') &&
          marker.trackDistanceMeters >= opening.fromDistanceMeters - 0.001 &&
          marker.trackDistanceMeters <= opening.toDistanceMeters + 0.001,
      )
      invariant(isPitTransition, `${entry.id} braking marker canonical barrier`)
      // Pit transitions intentionally remove the canonical barrier.  The
      // board remains valid beside the asphalt edge, but has no protection
      // polyline to project against in this short opening interval.
      const cornerMarkers = byCorner.get(marker.cornerIndex) ?? []
      cornerMarkers.push(marker.distanceToCornerMeters)
      byCorner.set(marker.cornerIndex, cornerMarkers)
      continue
    }
    invariant(Boolean(barrier), `${entry.id} braking marker canonical barrier`)
    invariant(
      marker.elevationLayer === barrier.path[0].elevationLayer,
      `${entry.id} braking marker elevation`,
    )
    const projection = projectPointToPolyline(marker.position, barrier.path)
    invariant(Boolean(projection), `${entry.id} braking marker barrier projection`)
    invariant(
      projection.distanceMeters >= 0.2 && projection.distanceMeters <= 1.15,
      `${entry.id} braking marker stays beside canonical protection`,
    )
    const cornerMarkers = byCorner.get(marker.cornerIndex) ?? []
    cornerMarkers.push(marker.distanceToCornerMeters)
    byCorner.set(marker.cornerIndex, cornerMarkers)
  }

  invariant(byCorner.size >= 2, `${entry.id} braking marker zones`)
  for (const [cornerIndex, distances] of byCorner) {
    distances.sort((first, second) => second - first)
    invariant(distances.at(-1) === 50, `${entry.id} turn ${cornerIndex} 50 m board`)
    for (let index = 1; index < distances.length; index += 1) {
      invariant(
        distances[index - 1] - distances[index] === 50,
        `${entry.id} turn ${cornerIndex} descending braking boards`,
      )
    }
  }
}

function validateTrackInfrastructure(track, entry) {
  invariant(track.pitLane.path.length >= 25, `${entry.id} detailed pit path`)
  const garageBarrier = track.pitLane.garageBarrier
  invariant(
    garageBarrier &&
      (garageBarrier.side === 'left' || garageBarrier.side === 'right') &&
      garageBarrier.material === 'concrete-wall' &&
      Number.isFinite(garageBarrier.thicknessMeters) &&
      garageBarrier.thicknessMeters >= 0.1 &&
      garageBarrier.thicknessMeters <= 2 &&
      Array.isArray(garageBarrier.path) &&
      garageBarrier.path.length >= 2 &&
      garageBarrier.path.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
    `${entry.id} pit garage collision boundary`,
  )
  const pitStyle = track.pitLane.visualStyle
  invariant(Boolean(pitStyle), `${entry.id} pit visual style`)
  invariant(
    Number.isInteger(pitStyle.garageCount) &&
      pitStyle.garageCount === 22,
    `${entry.id} pit garage count`,
  )
  invariant(
    pitStyle.buildingHeightMeters >= 3 && pitStyle.buildingHeightMeters <= 24,
    `${entry.id} pit building height`,
  )
  for (const [field, minimum, maximum] of [
    ['laneWidthMeters', 6, 16],
    ['garageStartRatio', 0.05, 0.8],
    ['garageEndRatio', 0.2, 0.95],
    ['pitBoxLengthMeters', 3, 12],
    ['pitBoxDepthMeters', 1.5, 4],
    ['pitBoxCenterOffsetMeters', 1, 5],
    ['garageDepthMeters', 3, 16],
    ['garageCenterOffsetMeters', 6, 24],
    ['pitWallHeightMeters', 0.6, 1.5],
    ['canopyDepthMeters', 0, 5],
  ]) {
    invariant(
      Number.isFinite(pitStyle[field]) &&
        pitStyle[field] >= minimum &&
        pitStyle[field] <= maximum,
      `${entry.id} pit ${field}`,
    )
  }
  invariant(
    pitStyle.garageStartRatio < pitStyle.garageEndRatio,
    `${entry.id} pit garage span`,
  )
  for (const colorKey of [
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'roofColor',
  ]) {
    invariant(
      /^#[0-9a-f]{6}$/i.test(pitStyle[colorKey]),
      `${entry.id} pit ${colorKey}`,
    )
  }
  invariant(track.sceneryLayout.landmarks.length === 0, `${entry.id} provisional landmarks removed`)
  invariant(
    track.sceneryLayout.staticObjects.some(
      (object) => object.kind === 'start-gantry',
    ),
    `${entry.id} start gantry`,
  )
  validateEscapeRoads(track, entry)
  validateBrakingMarkers(track, entry)
  const authoredStructures = track.sceneryLayout.staticObjects.filter(
    (object) => object.kind !== 'start-gantry',
  )
  invariant(authoredStructures.length >= 5, `${entry.id} authored infrastructure`)
  invariant(
    authoredStructures.filter((object) => object.kind.includes('grandstand')).length >= 3,
    `${entry.id} spectator grandstand coverage`,
  )
  invariant(
    authoredStructures.some((object) => object.kind.includes('grandstand')),
    `${entry.id} spectator grandstand`,
  )
  invariant(
    authoredStructures.some(
      (object) =>
        object.kind.includes('building') || object.kind.includes('tower'),
    ),
    `${entry.id} start-area building`,
  )
  for (const object of authoredStructures) {
    invariant(Boolean(object.visualStyle), `${entry.id} ${object.id} visual style`)
    invariant(
      Object.values(object.visualStyle).every((color) =>
        /^#[0-9a-f]{6}$/i.test(color),
      ),
      `${entry.id} ${object.id} visual palette`,
    )
    invariant(Boolean(object.dimensions), `${entry.id} ${object.id} dimensions`)
    invariant(
      object.dimensions.lengthMeters > 0 &&
        object.dimensions.depthMeters > 0 &&
        object.dimensions.heightMeters > 0,
      `${entry.id} ${object.id} positive dimensions`,
    )
  }
  const fencedSides = track.trackLimits.segments.reduce(
    (count, segment) =>
      count + Number(Boolean(segment.left.fence)) + Number(Boolean(segment.right.fence)),
    0,
  )
  invariant(fencedSides >= 2, `${entry.id} spectator safety fencing`)
  for (const segment of track.trackLimits.segments) {
    for (const side of ['left', 'right']) {
      const environment = segment[side]
      if (!environment.fence) {
        invariant(
          !environment.fenceVisualStyle,
          `${entry.id} ${side} orphan fence visual style`,
        )
        continue
      }
      const fence = environment.fenceVisualStyle
      invariant(Boolean(fence), `${entry.id} ${side} fence visual style`)
      invariant(
        fence.heightMeters >= 2 && fence.heightMeters <= 6 &&
          fence.postSpacingMeters >= 1.5 && fence.postSpacingMeters <= 5 &&
          fence.meshOpacity >= 0.05 && fence.meshOpacity <= 0.5 &&
          fence.cantileverMeters >= 0 && fence.cantileverMeters <= 1.2 &&
          /^#[0-9a-f]{6}$/i.test(fence.postColor) &&
          /^#[0-9a-f]{6}$/i.test(fence.meshColor),
        `${entry.id} ${side} fence dimensions and palette`,
      )
    }
  }

  const start = track.centerline[0]
  invariant(
    Math.hypot(
      track.startFinish.position.x - start.x,
      track.startFinish.position.y - start.y,
    ) <= 0.01,
    `${entry.id} start line anchored to centerline`,
  )
  const forward = Math.atan2(
    track.startFinish.forward.y,
    track.startFinish.forward.x,
  )
  const before = tangentAtDistance(
    track.centerline,
    track.lengthMeters - 35,
    track.lengthMeters,
  )
  const after = tangentAtDistance(track.centerline, 35, track.lengthMeters)
  invariant(
    angleDifference(
      Math.atan2(before.y, before.x),
      Math.atan2(after.y, after.x),
    ) <= (5 * Math.PI) / 180,
    `${entry.id} start must be on a straight`,
  )
  invariant(
    angleDifference(
      forward,
      Math.atan2(after.y, after.x),
    ) <= (3 * Math.PI) / 180,
    `${entry.id} start direction`,
  )

  if (entry.id === 'monaco') {
    invariant(
      Math.hypot(start.x + 479.319, start.y + 493.069) <= 2,
      'monaco start must be rebased to Boulevard Albert 1er',
    )
  }
  if (entry.id === 'suzuka') {
    const lower = []
    const upper = []
    for (let index = 0; index < track.centerline.length - 1; index += 1) {
      const from = track.centerline[index]
      const to = track.centerline[index + 1]
      if (from.elevationLayer !== to.elevationLayer) continue
      const target = from.elevationLayer > 0 ? upper : lower
      target.push({ from, to })
    }
    let crossings = 0
    for (const lowerSegment of lower) {
      const { from: a, to: b } = lowerSegment
      for (const upperSegment of upper) {
        const { from: c, to: d } = upperSegment
        const denominator =
          (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)
        if (Math.abs(denominator) <= 1e-9) continue
        const first = a.x * b.y - a.y * b.x
        const second = c.x * d.y - c.y * d.x
        const x =
          (first * (c.x - d.x) - (a.x - b.x) * second) / denominator
        const y =
          (first * (c.y - d.y) - (a.y - b.y) * second) / denominator
        const within = (value, from, to) =>
          value >= Math.min(from, to) - 1e-6 && value <= Math.max(from, to) + 1e-6
        if (
          within(x, a.x, b.x) && within(y, a.y, b.y) &&
          within(x, c.x, d.x) && within(y, c.y, d.y)
        ) {
          crossings += 1
        }
      }
    }
    invariant(crossings >= 1, 'suzuka must retain a lower/upper crossover')
  }
}

function transformVehicleShape(shape, position, tangent) {
  return shape.vertices.map((vertex) => ({
    x: position.x + vertex.x * tangent.x - vertex.y * tangent.y,
    y: position.y + vertex.x * tangent.y + vertex.y * tangent.x,
  }))
}

function polygonBounds(vertices) {
  return vertices.reduce(
    (bounds, vertex) => ({
      minX: Math.min(bounds.minX, vertex.x),
      minY: Math.min(bounds.minY, vertex.y),
      maxX: Math.max(bounds.maxX, vertex.x),
      maxY: Math.max(bounds.maxY, vertex.y),
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

function validateInfrastructureClearance(track, entry) {
  const structures = track.sceneryLayout.staticObjects
    .filter((object) => object.kind !== 'start-gantry')
    .map((object) => {
      const collider = orientedRectangle(
        object.position,
        object.rotation,
        object.dimensions.lengthMeters,
        object.dimensions.depthMeters,
      )
      return { id: object.id, collider, bounds: polygonBounds(collider) }
    })
  const road = track.centerline.slice(0, -1).map((from, index) => {
    const to = track.centerline[index + 1]
    const collider = roadSurfaceCollider(from, to)
    return { collider, bounds: polygonBounds(collider) }
  })
  const barriers = track.barrierGeometry.segments.flatMap((segment) =>
    segment.path.slice(0, -1).map((_, pathIndex) => {
      const collider = barrierCollider(segment, pathIndex)
      return {
        id: `${segment.side}-${segment.trackLimitSegmentIndex}-${pathIndex}`,
        collider,
        bounds: polygonBounds(collider),
      }
    }),
  )

  for (const structure of structures) {
    invariant(
      !road.some(
        (surface) =>
          boundsIntersect(structure.bounds, surface.bounds) &&
          polygonsIntersect(structure.collider, surface.collider),
      ),
      `${entry.id} ${structure.id} overlaps racing asphalt`,
    )
    const overlappingBarrier = barriers.find(
      (barrier) =>
        boundsIntersect(structure.bounds, barrier.bounds) &&
        polygonsIntersect(structure.collider, barrier.collider),
    )
    invariant(
      !overlappingBarrier,
      `${entry.id} ${structure.id} overlaps barrier ${overlappingBarrier?.id}`,
    )
  }

  for (let firstIndex = 0; firstIndex < structures.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < structures.length; secondIndex += 1) {
      const first = structures[firstIndex]
      const second = structures[secondIndex]
      invariant(
        !boundsIntersect(first.bounds, second.bounds) ||
          !polygonsIntersect(first.collider, second.collider),
        `${entry.id} ${first.id} overlaps ${second.id}`,
      )
    }
  }

  const pit = track.pitLane
  const style = pit.visualStyle
  const pathLastIndex = pit.path.length - 1
  const span = track.lengthMeters - pit.entryDistanceMeters + pit.exitDistanceMeters
  const firstGarageIndex = Math.ceil(style.garageStartRatio * pathLastIndex)
  const lastGarageIndex = Math.floor(style.garageEndRatio * pathLastIndex)
  const pitPathLengthMeters = pit.path.slice(1).reduce(
    (total, point, index) =>
      total + Math.hypot(point.x - pit.path[index].x, point.y - pit.path[index].y),
    0,
  )
  const garageSpanMeters =
    pitPathLengthMeters * (style.garageEndRatio - style.garageStartRatio)
  const garagePathLengthMeters = pit.garageBarrier.path.slice(1).reduce(
    (total, point, index) =>
      total + Math.hypot(
        point.x - pit.garageBarrier.path[index].x,
        point.y - pit.garageBarrier.path[index].y,
      ),
    0,
  )
  invariant(
    garagePathLengthMeters > 0 &&
      garagePathLengthMeters >= garageSpanMeters * 0.8 &&
      garagePathLengthMeters <= garageSpanMeters * 1.25,
    `${entry.id} garage collision boundary follows garage span`,
  )
  invariant(
    garageSpanMeters >= style.garageCount * style.pitBoxLengthMeters &&
      garageSpanMeters <=
        style.garageCount * (style.pitBoxLengthMeters + 1.25),
    `${entry.id} pit garage span matches the declared boxes`,
  )
  for (let index = firstGarageIndex; index <= lastGarageIndex; index += 1) {
    const progress = index / pathLastIndex
    const centerlineDistance =
      (pit.entryDistanceMeters + span * progress) % track.lengthMeters
    const center = sampleAtDistance(
      track.centerline,
      centerlineDistance,
      track.lengthMeters,
    )
    const pitCenter = pit.path[index]
    const clearGap =
      Math.hypot(pitCenter.x - center.x, pitCenter.y - center.y) -
      center.halfWidthMeters -
      style.laneWidthMeters / 2
    invariant(
      clearGap >= 0.35,
      `${entry.id} pit lane overlaps main track through the garage span`,
    )
  }
  for (let index = firstGarageIndex; index < lastGarageIndex; index += 1) {
    const from = {
      ...pit.path[index],
      halfWidthMeters: style.laneWidthMeters / 2,
    }
    const to = {
      ...pit.path[index + 1],
      halfWidthMeters: style.laneWidthMeters / 2,
    }
    const collider = roadSurfaceCollider(from, to)
    const bounds = polygonBounds(collider)
    const overlappingBarrier = barriers.find(
      (barrier) =>
        boundsIntersect(bounds, barrier.bounds) &&
        polygonsIntersect(collider, barrier.collider),
    )
    invariant(
      !overlappingBarrier,
      `${entry.id} pit lane segment ${index}-${index + 1} overlaps barrier ` +
        `${overlappingBarrier?.id} through the garage span`,
    )
  }
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

function validateCenteredVehicleClearance(track, vehicle) {
  const collisions = []
  const barriers = track.barrierGeometry.segments.flatMap((segment) =>
    segment.path.slice(0, -1).map((point, pathIndex) => {
      const collider = barrierCollider(segment, pathIndex)
      return {
        id: `barrier-${segment.index}-${pathIndex}`,
        elevationLayer: point.elevationLayer,
        collider,
        bounds: polygonBounds(collider),
      }
    }),
  )

  for (let index = 0; index < track.centerline.length - 1; index += 1) {
    const point = track.centerline[index]
    const tangent = tangentAtDistance(
      track.centerline,
      point.distanceMeters,
      track.lengthMeters,
    )
    const vehicleShapes = vehicle.collisionShapes.map((shape) => {
      const collider = transformVehicleShape(shape, point, tangent)
      return { collider, bounds: polygonBounds(collider) }
    })
    for (const barrier of barriers) {
      if (barrier.elevationLayer !== point.elevationLayer) continue
      if (
        vehicleShapes.some(
          (shape) =>
            boundsIntersect(shape.bounds, barrier.bounds) &&
            polygonsIntersect(shape.collider, barrier.collider),
        )
      ) {
        collisions.push(
          `${track.id} centered vehicle collision at centerline ${index} ` +
            `(${point.distanceMeters} m) with ${barrier.id}`,
        )
      }
    }
  }
  invariant(collisions.length === 0, collisions.join('; '))
}

function validatePhysics(constants, decisions, scenarios, vehicle, protocol) {
  invariant(constants.version === PHYSICS_VERSION, 'physics constants version')
  invariant(decisions.contractVersion === VERSION, 'decision version')
  invariant(decisions.boostPolicy === 'removed', 'boost policy')
  invariant(decisions.shiftKeyPolicy === 'unassigned', 'Shift policy')
  invariant(
    JSON.stringify(decisions.inputActions) === JSON.stringify(['throttle', 'brake', 'steer']),
    'input actions',
  )
  invariant(constants.simulation.physicsStepSeconds === 1 / 120, 'physics step')
  invariant(constants.simulation.serverPhysicsSubstepsPerTick === 4, 'server substeps')
  invariant(constants.controls.brakeRisePerSecond === 12, 'brake input rise rate')
  invariant(constants.controls.brakeFallPerSecond === 6, 'brake input fall rate')
  validateRaceConstants(constants)
  validateBotPlanner(constants)
  invariant(constants.powertrain.gearRatios.length === 8, 'eight forward gears')
  invariant(
    constants.powertrain.automaticUpshiftWheelSlipAllowance === 0.08,
    'automatic upshift wheel-slip allowance',
  )
  invariant(constants.powertrain.maximumBrakeForceNewtons === 20000, 'maximum brake force')
  invariant(constants.powertrain.frontBrakeBias === 0.6, 'front brake bias')
  const expectedRedlineSpeedsKph = [105, 140, 175, 210, 245, 280, 315, 350]
  const radiansPerSecondAtRedline = constants.powertrain.redlineRpm * Math.PI * 2 / 60
  constants.powertrain.gearRatios.forEach((ratio, index) => {
    const speedKph =
      radiansPerSecondAtRedline * constants.vehicle.wheelRadiusMeters /
      (ratio * constants.powertrain.finalDriveRatio) * 3.6
    invariant(
      Math.abs(speedKph - expectedRedlineSpeedsKph[index]) <= 1,
      `gear ${index + 1} redline target: ${speedKph.toFixed(2)} km/h`,
    )
  })
  const frontAxleInertia =
    2 * constants.powertrain.frontWheelAssemblyMassKg *
    constants.vehicle.wheelRadiusMeters ** 2 *
    constants.powertrain.wheelAssemblyInertiaFactor
  const rearAxleInertia =
    2 * constants.powertrain.rearWheelAssemblyMassKg *
    constants.vehicle.wheelRadiusMeters ** 2 *
    constants.powertrain.wheelAssemblyInertiaFactor +
    constants.powertrain.rearDrivelineRotationalInertiaKgM2
  invariant(
    Math.abs(frontAxleInertia - constants.powertrain.frontAxleRotationalInertiaKgM2) < 1e-12,
    'front axle rotational inertia formula',
  )
  invariant(
    Math.abs(rearAxleInertia - constants.powertrain.rearAxleRotationalInertiaKgM2) < 1e-12,
    'rear axle rotational inertia formula',
  )
  invariant(!('wheelAngularResponsePerSecond' in constants.powertrain), 'no hidden wheel relaxation')
  invariant(!('referenceAxleLoadNewtons' in constants.tires), 'axle reference load is derived')
  invariant(!('combinedGripExponent' in constants.tires), 'combined grip is the normative Euclidean ellipse')
  invariant(constants.collision.maximumCcdEventsPerStep === 4, 'CCD event limit')
  invariant(constants.collision.maximumContactPoints === 2, '2D manifold contact limit')
  invariant(
    constants.collision.ccdMaximumAngularArcStepMeters === 0.05,
    'CCD maximum angular arc step',
  )
  invariant(
    constants.collision.ccdAngularPoseSamplesPerMaximumArcStep === 4,
    'CCD angular pose samples per maximum arc step',
  )
  invariant(
    constants.collision.ccdTimeEpsilonSeconds === 1e-8,
    'CCD time epsilon',
  )
  invariant(
    constants.collision.ccdAngularMotionEpsilonRadians === 1e-8,
    'CCD angular motion epsilon',
  )
  invariant(
    constants.collision.ccdTimeRefinementIterations === 8,
    'CCD time refinement iterations',
  )
  invariant(constants.collision.geometryEpsilon === 1e-8, 'geometry epsilon')
  invariant(
    constants.collision.contactPatchNormalVelocityMergeMetersPerSecond === 0.01,
    'solver contact patch normal velocity merge threshold',
  )
  invariant(constants.collision.manifoldNormalMergeCosine === 0.985, 'manifold normal merge cosine')
  invariant(!('barrierRestitution' in constants.collision), 'no global barrier restitution')
  invariant(!('tangentialFriction' in constants.collision), 'no ambiguous global collision friction')
  invariant(
    JSON.stringify(Object.keys(constants.collision.barrierMaterials).sort()) ===
      JSON.stringify(['concrete-wall', 'guardrail', 'tecpro', 'tyre-barrier']),
    'physical barrier material map',
  )
  for (const response of Object.values(constants.collision.barrierMaterials)) {
    invariant(response.restitution >= 0 && response.restitution <= 1, 'barrier restitution range')
    invariant(response.tangentialFriction >= 0 && response.tangentialFriction <= 2, 'barrier friction range')
  }
  invariant(constants.damage.minimumDeltaVMetersPerSecond === 5, 'damage minimum delta-v')
  invariant(constants.damage.mediumDeltaVMetersPerSecond === 10, 'damage medium delta-v')
  invariant(constants.damage.combinedDeltaVMetersPerSecond === 18, 'damage combined delta-v')
  invariant(constants.damage.totalLossDeltaVMetersPerSecond === 30, 'damage total-loss delta-v')
  invariant(constants.damage.healthDamagePerDeltaV === 1.5, 'damage health calibration')
  invariant(constants.damage.steeringPullStrength === 0.005, 'damage steering-pull calibration')
  invariant(
    Math.abs(
      constants.vehicle.frontAxleDistanceFromComMeters +
      constants.vehicle.rearAxleDistanceFromComMeters -
      constants.vehicle.wheelbaseMeters,
    ) < 1e-9,
    'axle distances must sum to wheelbase',
  )
  invariant(scenarios.contractVersion === VERSION, 'scenario contract version')
  invariant(scenarios.physicsConstantsVersion === PHYSICS_VERSION, 'scenario constants version')
  invariant(scenarios.scenarios.length >= 10, 'reference scenario coverage')
  invariant(vehicle.version === VERSION, 'vehicle version')
  invariant(vehicle.collisionShapes.length === 22, 'canonical compound vehicle collider')
  invariant(
    vehicle.dimensions.lengthMeters === constants.vehicle.lengthMeters &&
    vehicle.dimensions.widthMeters === constants.vehicle.widthMeters &&
    vehicle.dimensions.wheelbaseMeters === constants.vehicle.wheelbaseMeters &&
    vehicle.dimensions.frontAxleX === constants.vehicle.frontAxleDistanceFromComMeters &&
    -vehicle.dimensions.rearAxleX === constants.vehicle.rearAxleDistanceFromComMeters &&
    vehicle.massProperties.massKg === constants.vehicle.massKg &&
    vehicle.massProperties.yawInertiaKgM2 === constants.vehicle.yawInertiaKgM2,
    'vehicle definition and constants must agree',
  )
  const shapeIds = new Set()
  for (const shape of vehicle.collisionShapes) {
    invariant(!shapeIds.has(shape.id), `duplicate vehicle shape ${shape.id}`)
    shapeIds.add(shape.id)
    invariant(shape.vertices.length >= 3, `vehicle shape vertices ${shape.id}`)
    invariant(polygonArea(shape.vertices) > 0, `vehicle shape winding ${shape.id}`)
    invariant(isConvex(shape.vertices), `vehicle shape convexity ${shape.id}`)
  }
  const protocolText = JSON.stringify(protocol)
  invariant(!protocolText.includes('nitro'), 'protocol must not contain nitro')
  invariant(!protocolText.includes('boost'), 'protocol must not contain boost')
  invariant(!protocolText.includes('paintId'), 'protocol must use canonical color, not paintId')
  invariant(protocolText.includes('#a84448'), 'protocol canonical paint colors')
  invariant(protocolText.includes('physicsContractVersion'), 'protocol physics version')
  invariant(protocolText.includes('gearShiftTimeRemaining'), 'protocol shift state')
}

function validateTrack(track, entry, vehicle) {
  invariant(track.schemaVersion === VERSION, `${entry.id} schema version`)
  invariant(track.catalogVersion === CATALOG_VERSION, `${entry.id} catalog version`)
  invariant(track.physicsContractVersion === PHYSICS_VERSION, `${entry.id} physics version`)
  invariant(track.id === entry.id, `${entry.id} id`)
  invariant(track.lengthMeters === entry.lengthMeters, `${entry.id} length`)
  if (entry.id === 'singapore') {
    invariant(
      polygonArea(track.centerline) > 0,
      'singapore centerline must follow the anticlockwise race direction',
    )
  }
  invariant(track.barrierGeometry?.segments?.length >= 2, `${entry.id} barriers`)
  invariant(Array.isArray(track.barrierOpenings), `${entry.id} barrier openings`)
  const openingIds = new Set()
  for (const opening of track.barrierOpenings) {
    invariant(typeof opening.id === 'string' && opening.id.length > 0, `${entry.id} barrier opening id`)
    invariant(!openingIds.has(opening.id), `${entry.id} unique barrier opening id`)
    openingIds.add(opening.id)
    invariant(opening.side === 'left' || opening.side === 'right', `${entry.id} barrier opening side`)
    invariant(
      opening.fromDistanceMeters >= 0 &&
        opening.toDistanceMeters <= track.lengthMeters &&
        opening.toDistanceMeters > opening.fromDistanceMeters,
      `${entry.id} barrier opening range`,
    )
    invariant(
      ['escape-road-access', 'pit-entry', 'pit-exit'].includes(opening.reason),
      `${entry.id} barrier opening reason`,
    )
  }
  const openingReasons = track.barrierOpenings.map((opening) => opening.reason)
  invariant(
    openingReasons.includes('pit-entry'),
    `${entry.id} pit entry barrier opening`,
  )
  invariant(
    openingReasons.includes('pit-exit'),
    `${entry.id} pit exit barrier opening`,
  )
  invariant(
    !openingReasons.includes('escape-road-access'),
    `${entry.id} has no authored escape opening`,
  )

  const curbIndexes = new Set()
  for (const curb of track.curbs) {
    invariant(!curbIndexes.has(curb.index), `${entry.id} duplicate curb index`)
    curbIndexes.add(curb.index)
    invariant(
      curb.toDistanceMeters > curb.fromDistanceMeters,
      `${entry.id} curb range`,
    )
    invariant(
      curb.fromDistanceMeters >= 0 &&
        curb.toDistanceMeters <= track.lengthMeters,
      `${entry.id} curb bounds`,
    )
    invariant(
      Boolean(curb.outerColor) === Boolean(curb.outerWidthMeters),
      `${entry.id} curb outer paint pair`,
    )
    if (curb.outerColor) {
      invariant(/^#[0-9a-f]{6}$/i.test(curb.outerColor), `${entry.id} curb outer color`)
      invariant(
        curb.outerWidthMeters >= 0.1 && curb.outerWidthMeters <= 1.5,
        `${entry.id} curb outer width`,
      )
    }
  }
  for (const side of ['left', 'right']) {
    const sideCurbs = track.curbs
      .filter((curb) => curb.side === side)
      .sort((first, second) => first.fromDistanceMeters - second.fromDistanceMeters)
    for (let index = 1; index < sideCurbs.length; index += 1) {
      invariant(
        sideCurbs[index].fromDistanceMeters >=
          sideCurbs[index - 1].toDistanceMeters - 0.001,
        `${entry.id} ${side} curb overlap`,
      )
    }
  }

  let previousIndex = -1
  const coverageBySide = new Map()
  for (const segment of track.barrierGeometry.segments) {
    invariant(segment.index === previousIndex + 1, `${entry.id} barrier indices`)
    previousIndex = segment.index
    const trackLimit = track.trackLimits.segments[segment.trackLimitSegmentIndex]
    invariant(Boolean(trackLimit), `${entry.id} barrier track-limit reference`)
    invariant(segment.material === trackLimit[segment.side].barrier, `${entry.id} barrier material`)
    invariant(segment.path.length >= 2, `${entry.id} barrier path`)
    invariant(segment.fromDistanceMeters === segment.path[0].distanceMeters, `${entry.id} barrier start`)
    invariant(segment.toDistanceMeters === segment.path.at(-1).distanceMeters, `${entry.id} barrier end`)
    invariant(segment.fromDistanceMeters >= trackLimit.fromDistanceMeters - 0.001, `${entry.id} barrier range start`)
    invariant(segment.toDistanceMeters <= trackLimit.toDistanceMeters + 0.001, `${entry.id} barrier range end`)
    invariant(segment.chunkIndexes.length > 0, `${entry.id} barrier chunks`)
    const layer = segment.path[0].elevationLayer
    for (let pathIndex = 0; pathIndex < segment.path.length; pathIndex += 1) {
      const point = segment.path[pathIndex]
      invariant(point.elevationLayer === layer, `${entry.id} barrier crosses elevation layers`)
      if (pathIndex > 0) {
        invariant(
          point.distanceMeters > segment.path[pathIndex - 1].distanceMeters,
          `${entry.id} barrier path order`,
        )
      }
    }
    for (let firstIndex = 0; firstIndex < segment.path.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 2; secondIndex < segment.path.length - 1; secondIndex += 1) {
        invariant(
          !properSegmentsIntersect(
            segment.path[firstIndex],
            segment.path[firstIndex + 1],
            segment.path[secondIndex],
            segment.path[secondIndex + 1],
          ),
          `${entry.id} ${segment.side} canonical barrier self-intersection in segment ${segment.index} between edges ${firstIndex}-${firstIndex + 1} and ${secondIndex}-${secondIndex + 1}`,
        )
      }
    }
    const coverageKey = `${segment.trackLimitSegmentIndex}:${segment.side}`
    const coverage = coverageBySide.get(coverageKey) ?? []
    coverage.push(segment)
    coverageBySide.set(coverageKey, coverage)
  }

  for (const trackLimit of track.trackLimits.segments) {
    for (const side of ['left', 'right']) {
      const coverageKey = `${trackLimit.index}:${side}`
      const coverage = [
        ...(coverageBySide.get(coverageKey) ?? []),
        ...track.barrierOpenings
          .filter(
            (opening) =>
              opening.side === side &&
              opening.fromDistanceMeters < trackLimit.toDistanceMeters - 0.001 &&
              opening.toDistanceMeters > trackLimit.fromDistanceMeters + 0.001,
          )
          .map((opening) => ({
            fromDistanceMeters: Math.max(
              opening.fromDistanceMeters,
              trackLimit.fromDistanceMeters,
            ),
            toDistanceMeters: Math.min(
              opening.toDistanceMeters,
              trackLimit.toDistanceMeters,
            ),
          })),
      ]
        .sort((left, right) => left.fromDistanceMeters - right.fromDistanceMeters)
      invariant(coverage.length > 0, `${entry.id} ${side} barrier coverage`)
      let expectedFrom = trackLimit.fromDistanceMeters
      for (const segment of coverage) {
        invariant(
          Math.abs(segment.fromDistanceMeters - expectedFrom) <= 0.001,
          `${entry.id} ${side} barrier coverage gap or overlap`,
        )
        expectedFrom = segment.toDistanceMeters
      }
      invariant(
        Math.abs(expectedFrom - trackLimit.toDistanceMeters) <= 0.001,
        `${entry.id} ${side} barrier coverage end`,
      )
    }
  }
  for (const side of ['left', 'right']) {
    const segments = track.barrierGeometry.segments
      .filter((segment) => segment.side === side)
      .sort(
        (first, second) =>
          first.fromDistanceMeters - second.fromDistanceMeters,
      )
    for (let index = 1; index < segments.length; index += 1) {
      const previousSegment = segments[index - 1]
      const currentSegment = segments[index]
      const openingBetween = track.barrierOpenings.some(
        (opening) =>
          opening.side === side &&
          Math.abs(opening.fromDistanceMeters - previousSegment.toDistanceMeters) <= 0.001 &&
          Math.abs(opening.toDistanceMeters - currentSegment.fromDistanceMeters) <= 0.001,
      )
      if (openingBetween) continue
      const previous = previousSegment.path.at(-1)
      const current = currentSegment.path[0]
      invariant(
        Math.hypot(previous.x - current.x, previous.y - current.y) <= 0.002,
        `${entry.id} ${side} canonical barrier continuity`,
      )
    }
  }
  validateTrackInfrastructure(track, entry)
  validateInfrastructureClearance(track, entry)
  validateCenteredVehicleClearance(track, vehicle)
}

async function validateMirror() {
  if (!mirrorDirectory) return
  for (const relativePath of sharedFiles) {
    const [canonical, mirror] = await Promise.all([
      readFile(resolve(contractDirectory, relativePath)),
      readFile(resolve(mirrorDirectory, relativePath)),
    ])
    const canonicalHash = createHash('sha256').update(canonical).digest('hex')
    const mirrorHash = createHash('sha256').update(mirror).digest('hex')
    invariant(canonicalHash === mirrorHash, `mirror differs: ${relativePath}`)
  }
  const mirrorTracks = await readdir(resolve(mirrorDirectory, 'tracks')).catch(() => [])
  invariant(mirrorTracks.length === 0, 'frontend mirror must not embed track definitions')
}

const [
  catalog,
  constants,
  decisions,
  scenarios,
  vehicle,
  protocol,
  catalogSchema,
] = await Promise.all([
  json('catalog.json'),
  json('physics-constants.json'),
  json('module-2-decisions.json'),
  json('physics-reference-scenarios.json'),
  json('vehicle-definition.json'),
  json('realtime-race-protocol.schema.json'),
  json('track-catalog.schema.json'),
])

invariant(catalog.schemaVersion === VERSION, 'catalog schema version')
invariant(catalog.catalogVersion === CATALOG_VERSION, 'catalog version')
invariant(catalog.physicsContractVersion === PHYSICS_VERSION, 'catalog physics version')
invariant(
  catalogSchema.required.includes('calendarPolicy'),
  'catalog schema requires calendarPolicy',
)
invariant(catalog.tracks.length === TRACK_COUNT, 'catalog track count')
invariant(new Set(catalog.tracks.map((entry) => entry.id)).size === TRACK_COUNT, 'track ids')
invariant(new Set(catalog.tracks.map((entry) => entry.round)).size === TRACK_COUNT, 'track rounds')

validatePhysics(constants, decisions, scenarios, vehicle, protocol)
for (const entry of catalog.tracks) {
  validateTrack(await json(entry.definitionPath), entry, vehicle)
}
await validateMirror()

console.log(
  `Audited contract ${VERSION}, catalog ${CATALOG_VERSION}, ${TRACK_COUNT} tracks` +
    (mirrorDirectory ? ', and the byte-identical frontend mirror.' : '.'),
)
