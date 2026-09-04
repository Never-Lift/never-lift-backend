// Freeze actual TS geometry and decision outputs, not a reimplementation of them.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertReferenceMatches, requireReferenceRuntime } from './reference-support.mjs'
requireReferenceRuntime()
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const frontend = resolve(process.argv[2] ?? '../never-lift-frontend')
const { createServer } = await import(pathToFileURL(resolve(frontend, 'node_modules/vite/dist/node/index.js')).href)
const server = await createServer({ root: frontend, configFile: resolve(frontend, 'vite.config.ts'), server: { middlewareMode: true } })
try {
  const { TrackGeometry } = await server.ssrLoadModule('/src/race/TrackGeometry.ts')
  const { RaceEngine } = await server.ssrLoadModule('/src/race/RaceEngine.ts')
  const { atan2 } = await server.ssrLoadModule('/src/race/portable-math.ts')
  const catalog = JSON.parse(await readFile(resolve(root, 'contracts/module-2/v2/catalog.json'), 'utf8'))
  const tracks = []
  for (const item of catalog.tracks) {
    const definition = JSON.parse(await readFile(resolve(root, `contracts/module-2/v2/tracks/${item.id}.json`), 'utf8'))
    const geometry = new TrackGeometry(definition)
    const engine = new RaceEngine({ track: definition, mode: 'solo', racers: [{id:'bot-reference',name:'Bot',kind:'bot',color:'#365f82'}] })
    const samples = []
    const sampleDistances = [0, ...Array.from({length:8}, (_,i)=>definition.lengthMeters*(i+1)/9)]
    for (const distance of sampleDistances) for (const offset of [0, 8, -15]) {
      const center = geometry.getCenterlinePoint(distance), tangent = geometry.getCenterlineTangent(distance)
      const position = { x:center.x-tangent.y*offset, y:center.y+tangent.x*offset }
      const projection = geometry.project(position,distance)
      const bounds = {minX:position.x-5,minY:position.y-5,maxX:position.x+5,maxY:position.y+5}
      const car = engine.vehicles[0]
      Object.assign(car,{position,trackDistanceMeters:distance,angle:atan2(tangent.y,tangent.x),velocity:{x:tangent.x*30,y:tangent.y*30},surface:geometry.getSurfaceAt(position,distance)})
      engine.simulationTimeSeconds = 2
      const inputs = {}
      for (const difficulty of ['easy','normal','hard']) {car.botDifficulty=difficulty;inputs[difficulty]=engine.createBotInput(car)}
      samples.push({distance,position,projection,surface:car.surface,bounds,barriers:geometry.getBarrierColliders(projection.elevationLayer,bounds),inputs,angle:car.angle,velocity:car.velocity})
    }
    tracks.push({id:item.id,samples})
  }
  const sources = {}
  for (const name of ['src/race/TrackGeometry.ts','src/race/RaceEngine.ts','src/race/constants.ts','src/race/portable-math.ts','src/race/math.ts','src/race/physics-utils.ts']) sources[name]=createHash('sha256').update((await readFile(resolve(frontend,name),'utf8')).replaceAll('\r\n','\n')).digest('hex')
  const output=resolve(root,'src/test/resources/physics/typescript-geometry-2.0.3.json')
  const result=JSON.stringify({physicsContractVersion:'2.0.3',sources,tracks},null,2)+'\n'
  if(process.argv.includes('--check')) { assertReferenceMatches(await readFile(output,'utf8'),result,'Geometry reference') }
  else await writeFile(output,result)
  console.log(`Verified TS geometry and bots for ${tracks.length} circuits (${tracks.reduce((sum,t)=>sum+t.samples.length,0)} samples)`)
} finally { await server.close() }
