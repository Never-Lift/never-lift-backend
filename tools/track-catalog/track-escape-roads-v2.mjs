const monzaRettifiloSlalom = Object.freeze({
  id: 'rettifilo-slalom',
  kind: 'slalom-block-rows',
  affectsPhysics: false,
  elevationLayer: 0,
  widthMeters: 7,
  // The entry and exit sit on the canonical centerline while the middle keeps
  // the straight-ahead Rettifilo escape route instead of following the chicane.
  path: [
    { x: 49.28, y: 567.41 },
    { x: 54.2, y: 620 },
    { x: 62, y: 650 },
    { x: 89.43, y: 672.09 },
  ],
  // Each short row blocks one side of the paved corridor and leaves the next
  // opening on the opposite side, reproducing the low-speed slalom without
  // introducing a physical collider in contract v2.
  obstacleRows: [
    {
      from: { x: 55.743, y: 602.672 },
      to: { x: 51.561, y: 603.063 },
      blockLengthMeters: 0.9,
      palette: 'red-white',
    },
    {
      from: { x: 54.982, y: 617.09 },
      to: { x: 50.801, y: 617.481 },
      blockLengthMeters: 0.9,
      palette: 'red-white',
    },
    {
      from: { x: 60.132, y: 630.298 },
      to: { x: 56.067, y: 631.355 },
      blockLengthMeters: 0.9,
      palette: 'red-white',
    },
    {
      from: { x: 61.694, y: 644.652 },
      to: { x: 57.629, y: 645.708 },
      blockLengthMeters: 0.9,
      palette: 'red-white',
    },
    {
      from: { x: 71.009, y: 653.211 },
      to: { x: 68.375, y: 656.482 },
      blockLengthMeters: 0.9,
      palette: 'red-white',
    },
  ],
})

const escapeRoadsByTrack = Object.freeze({
  monza: Object.freeze([monzaRettifiloSlalom]),
})

export function escapeRoadsFor(trackId) {
  return structuredClone(escapeRoadsByTrack[trackId] ?? [])
}
