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
const CATALOG_VERSION = '2026.6'
const PHYSICS_VERSION = '2.0.0'
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

function validatePhysics(constants, decisions, scenarios, vehicle, protocol) {
  invariant(constants.version === VERSION, 'physics constants version')
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
  invariant(constants.collision.geometryEpsilon === 1e-8, 'geometry epsilon')
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
  invariant(
    Math.abs(
      constants.vehicle.frontAxleDistanceFromComMeters +
      constants.vehicle.rearAxleDistanceFromComMeters -
      constants.vehicle.wheelbaseMeters,
    ) < 1e-9,
    'axle distances must sum to wheelbase',
  )
  invariant(scenarios.contractVersion === VERSION, 'scenario contract version')
  invariant(scenarios.physicsConstantsVersion === VERSION, 'scenario constants version')
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

function validateTrack(track, entry) {
  invariant(track.schemaVersion === VERSION, `${entry.id} schema version`)
  invariant(track.catalogVersion === CATALOG_VERSION, `${entry.id} catalog version`)
  invariant(track.physicsContractVersion === PHYSICS_VERSION, `${entry.id} physics version`)
  invariant(track.id === entry.id, `${entry.id} id`)
  invariant(track.lengthMeters === entry.lengthMeters, `${entry.id} length`)
  invariant(track.barrierGeometry?.segments?.length >= 2, `${entry.id} barriers`)

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
    const coverageKey = `${segment.trackLimitSegmentIndex}:${segment.side}`
    const coverage = coverageBySide.get(coverageKey) ?? []
    coverage.push(segment)
    coverageBySide.set(coverageKey, coverage)
  }

  for (const trackLimit of track.trackLimits.segments) {
    for (const side of ['left', 'right']) {
      const coverageKey = `${trackLimit.index}:${side}`
      const coverage = (coverageBySide.get(coverageKey) ?? [])
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
] = await Promise.all([
  json('catalog.json'),
  json('physics-constants.json'),
  json('module-2-decisions.json'),
  json('physics-reference-scenarios.json'),
  json('vehicle-definition.json'),
  json('realtime-race-protocol.schema.json'),
])

invariant(catalog.schemaVersion === VERSION, 'catalog schema version')
invariant(catalog.catalogVersion === CATALOG_VERSION, 'catalog version')
invariant(catalog.physicsContractVersion === PHYSICS_VERSION, 'catalog physics version')
invariant(catalog.tracks.length === TRACK_COUNT, 'catalog track count')
invariant(new Set(catalog.tracks.map((entry) => entry.id)).size === TRACK_COUNT, 'track ids')
invariant(new Set(catalog.tracks.map((entry) => entry.round)).size === TRACK_COUNT, 'track rounds')

validatePhysics(constants, decisions, scenarios, vehicle, protocol)
for (const entry of catalog.tracks) validateTrack(await json(entry.definitionPath), entry)
await validateMirror()

console.log(
  `Audited contract ${VERSION}, catalog ${CATALOG_VERSION}, ${TRACK_COUNT} tracks` +
    (mirrorDirectory ? ', and the byte-identical frontend mirror.' : '.'),
)
