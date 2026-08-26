import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..', '..')
const v1Directory = resolve(repositoryRoot, 'contracts', 'module-2', 'v1')
const v2Directory = resolve(repositoryRoot, 'contracts', 'module-2', 'v2')
const checkOnly = process.argv.includes('--check')

const SCHEMA_VERSION = '2.0.0'
const CATALOG_VERSION = '2026.6'
const PHYSICS_CONTRACT_VERSION = '2.0.0'
const ROUND_DECIMALS = 3

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

function barrierFacePoint(track, sideEnvironment, side, distanceMeters) {
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
  const runoffWidth = sideEnvironment.zones.reduce(
    (total, zone) => total + zone.widthMeters,
    0,
  )
  const faceOffset = center.halfWidthMeters + runoffWidth
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
        barrierFacePoint(track, sideEnvironment, side, distanceMeters),
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

function createTrackLimitsV2(track) {
  if (track.id !== 'monaco') return track.trackLimits

  return {
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
}

function createTrackV2(track) {
  const trackLimits = createTrackLimitsV2(track)
  const v2Track = { ...track, trackLimits }
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
      transformation:
        `${track.source.transformation} Contract v2 derives each track-facing ` +
        'barrier polyline from the sampled centerline, local track half-width, ' +
        'and the audited runoff-zone widths in catalog 2026.5; barrier thickness ' +
        `extends away from the racing surface.${clearanceTransformation}`,
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
      barrierGeometry: { $ref: '#/$defs/barrierGeometry' },
    },
    $defs: {
      ...v1Schema.$defs,
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
