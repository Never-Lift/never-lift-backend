import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..', '..')
const contractDirectory = resolve(repositoryRoot, 'contracts', 'module-2', 'v2')
const catalog = JSON.parse(await readFile(resolve(contractDirectory, 'catalog.json'), 'utf8'))
const requestedTrack = process.argv
  .find((argument) => argument.startsWith('--track='))
  ?.slice('--track='.length)
const entries = requestedTrack
  ? catalog.tracks.filter((entry) => entry.id === requestedTrack)
  : catalog.tracks
if (entries.length === 0) throw new Error(`Unknown track: ${requestedTrack}`)

const columns = requestedTrack ? 1 : 4
const cardWidth = requestedTrack ? 1400 : 520
const cardHeight = requestedTrack ? 1000 : 360
const rows = Math.ceil(entries.length / columns)
const surfaceColors = {
  asphalt: '#46505e',
  grass: '#2d663b',
  gravel: '#9b8c6f',
}
const barrierColors = {
  'concrete-wall': '#f0f0fa',
  guardrail: '#aab5c4',
  tecpro: '#527cba',
  'tyre-barrier': '#171b21',
}
const curbColors = {
  'red-white': '#e33145',
  'orange-white': '#ff6a2a',
  'red-white-blue': '#3178d8',
  'green-white-red': '#15985f',
  'red-yellow': '#e33145',
  'green-yellow': '#e7c522',
  'maroon-white': '#8d1e43',
  'blue-white': '#3178d8',
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function tangentAt(points, index) {
  const previous = points[Math.max(0, index - 1)]
  const next = points[Math.min(points.length - 1, index + 1)]
  const x = next.x - previous.x
  const y = next.y - previous.y
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length }
}

function offsetPoint(points, index, side, offsetMeters) {
  const point = points[index]
  const tangent = tangentAt(points, index)
  const direction = side === 'left' ? 1 : -1
  return {
    x: point.x - tangent.y * offsetMeters * direction,
    y: point.y + tangent.x * offsetMeters * direction,
  }
}

function pointsAttribute(points) {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

function limitAt(track, distanceMeters) {
  const normalizedDistance =
    ((distanceMeters % track.lengthMeters) + track.lengthMeters) %
    track.lengthMeters
  return track.trackLimits.segments.find(
    (segment) =>
      normalizedDistance >= segment.fromDistanceMeters &&
      normalizedDistance < segment.toDistanceMeters,
  ) ?? track.trackLimits.segments.at(-1)
}

function environmentWidth(environment) {
  return environment.zones.reduce((total, zone) => total + zone.widthMeters, 0)
}

function line(from, to, attributes) {
  return `<line x1="${from.x.toFixed(2)}" y1="${from.y.toFixed(2)}" x2="${to.x.toFixed(2)}" y2="${to.y.toFixed(2)}" ${attributes}/>`
}

function renderTrack(track, cardX, cardY) {
  const paddingX = requestedTrack ? 70 : 24
  const paddingTop = requestedTrack ? 100 : 56
  const paddingBottom = requestedTrack ? 60 : 28
  const width = cardWidth - paddingX * 2
  const height = cardHeight - paddingTop - paddingBottom
  const worldWidth = Math.max(1, track.bounds.maxX - track.bounds.minX)
  const worldHeight = Math.max(1, track.bounds.maxY - track.bounds.minY)
  const scale = Math.min(width / worldWidth, height / worldHeight)
  const drawnWidth = worldWidth * scale
  const drawnHeight = worldHeight * scale
  const originX = cardX + paddingX + (width - drawnWidth) / 2
  const originY = cardY + paddingTop + (height - drawnHeight) / 2 + drawnHeight
  const transform = `translate(${originX.toFixed(2)} ${originY.toFixed(2)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)}) translate(${(-track.bounds.minX).toFixed(2)} ${(-track.bounds.minY).toFixed(2)})`
  const elements = []

  for (let index = 0; index < track.centerline.length - 1; index += 1) {
    const from = track.centerline[index]
    const to = track.centerline[index + 1]
    const segment = limitAt(track, (from.distanceMeters + to.distanceMeters) / 2)
    for (const side of ['left', 'right']) {
      const fromEnvironment = limitAt(track, from.distanceMeters)[side]
      const toEnvironment = limitAt(track, to.distanceMeters)[side]
      const styleEnvironment = segment[side]
      const styleWidth = environmentWidth(styleEnvironment)
      if (styleWidth <= Number.EPSILON) continue
      const fromWidth = environmentWidth(fromEnvironment)
      const toWidth = environmentWidth(toEnvironment)
      let innerOffset = 0
      for (const zone of styleEnvironment.zones) {
        const outerOffset = innerOffset + zone.widthMeters
        const polygon = [
          offsetPoint(track.centerline, index, side, from.halfWidthMeters + innerOffset / styleWidth * fromWidth),
          offsetPoint(track.centerline, index + 1, side, to.halfWidthMeters + innerOffset / styleWidth * toWidth),
          offsetPoint(track.centerline, index + 1, side, to.halfWidthMeters + outerOffset / styleWidth * toWidth),
          offsetPoint(track.centerline, index, side, from.halfWidthMeters + outerOffset / styleWidth * fromWidth),
        ]
        elements.push(`<polygon points="${pointsAttribute(polygon)}" fill="${surfaceColors[zone.surface]}"/>`)
        innerOffset = outerOffset
      }
    }
  }

  for (let index = 0; index < track.centerline.length - 1; index += 1) {
    const from = track.centerline[index]
    const to = track.centerline[index + 1]
    elements.push(
      line(
        from,
        to,
        `stroke="#29303b" stroke-width="${((from.halfWidthMeters + to.halfWidthMeters)).toFixed(2)}" stroke-linecap="round"`,
      ),
    )
  }

  for (const barrier of track.barrierGeometry.segments) {
    const environment = track.trackLimits.segments[
      barrier.trackLimitSegmentIndex
    ][barrier.side]
    elements.push(
      `<polyline points="${pointsAttribute(barrier.path)}" fill="none" ` +
        `stroke="${barrierColors[barrier.material]}" stroke-width="2" ` +
        'vector-effect="non-scaling-stroke" stroke-linecap="round" ' +
        'stroke-linejoin="round"/>',
    )
    if (environment.fence) {
      elements.push(
        `<polyline points="${pointsAttribute(barrier.path)}" fill="none" ` +
          'stroke="#718096" stroke-width="1.2" stroke-dasharray="4 3" ' +
          'vector-effect="non-scaling-stroke"/>',
      )
    }
  }

  for (const curb of track.curbs) {
    const indices = track.centerline.flatMap((point, index) =>
      point.distanceMeters >= curb.fromDistanceMeters - 5.01 &&
      point.distanceMeters <= curb.toDistanceMeters + 5.01
        ? [index]
        : [],
    )
    const curbLine = indices.map((index) => {
      const point = track.centerline[index]
      return offsetPoint(
        track.centerline,
        index,
        curb.side,
        point.halfWidthMeters + curb.widthMeters / 2,
      )
    })
    const dash = curb.stripeLengthMeters * scale
    elements.push(`<polyline points="${pointsAttribute(curbLine)}" fill="none" stroke="#f0f0fa" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`)
    elements.push(`<polyline points="${pointsAttribute(curbLine)}" fill="none" stroke="${curbColors[curb.palette]}" stroke-width="3" stroke-dasharray="${dash.toFixed(2)} ${dash.toFixed(2)}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`)
  }

  elements.push(
    `<polyline points="${pointsAttribute(track.pitLane.path)}" fill="none" ` +
      'stroke="#303a48" stroke-width="6" vector-effect="non-scaling-stroke" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>',
  )
  elements.push(
    `<circle cx="${track.startFinish.position.x}" cy="${track.startFinish.position.y}" ` +
      'r="4" fill="#31c7ff" vector-effect="non-scaling-stroke"/>',
  )

  return `
    <g>
      <rect x="${cardX + 8}" y="${cardY + 8}" width="${cardWidth - 16}" height="${cardHeight - 16}" rx="18" fill="#111925" stroke="#304157"/>
      <text x="${cardX + 24}" y="${cardY + 34}" fill="#f0f0fa" font-family="Arial, sans-serif" font-size="${requestedTrack ? 30 : 16}" font-weight="700">${escapeXml(`${track.id} · ${track.lengthMeters} m`)}</text>
      <g transform="${transform}">${elements.join('')}</g>
    </g>`
}

const tracks = await Promise.all(
  entries.map(async (entry) =>
    JSON.parse(await readFile(resolve(contractDirectory, entry.definitionPath), 'utf8')),
  ),
)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cardWidth}" height="${rows * cardHeight}" viewBox="0 0 ${columns * cardWidth} ${rows * cardHeight}">
  <rect width="100%" height="100%" fill="#070b14"/>
  ${tracks.map((track, index) => renderTrack(track, (index % columns) * cardWidth, Math.floor(index / columns) * cardHeight)).join('')}
</svg>`
const outputName = requestedTrack ? `track-${requestedTrack}.svg` : 'track-atlas.svg'
const outputPath = resolve(repositoryRoot, 'target', outputName)
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, svg)
console.log(`Rendered ${tracks.length} track(s) to ${outputPath}`)
