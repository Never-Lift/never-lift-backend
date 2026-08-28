// Braking boards are authored only for approaches where the driver arrives
// with enough speed for a real braking reference. The corner numbers follow
// the satellite turn markers reviewed on Grand Prix Guides on 2026-08-27 and
// are cross-checked against each circuit's official/FIA references already
// published in TrackDefinition.source.environmentReferences.
//
// Distances are intentionally conservative. A 250 m or 300 m board is used
// only after an exceptionally long/high-speed approach; compact sequences do
// not receive decorative boards that would imply a braking zone that is not
// there.
const profiles = Object.freeze({
  'albert-park': [[1, 150], [3, 150], [11, 200]],
  shanghai: [[1, 200], [6, 150], [14, 250]],
  suzuka: [[1, 150], [11, 150], [16, 200]],
  bahrain: [[1, 250], [4, 200], [8, 150], [10, 100], [14, 200]],
  jeddah: [[1, 200], [13, 150], [27, 200]],
  miami: [[1, 150], [11, 150], [17, 250]],
  montreal: [[1, 150], [6, 150], [10, 250], [13, 200]],
  monaco: [[1, 100], [10, 150]],
  barcelona: [[1, 250], [4, 150], [10, 200]],
  spielberg: [[1, 150], [3, 250], [4, 250]],
  silverstone: [[3, 150], [6, 150], [15, 200], [16, 150]],
  'spa-francorchamps': [[1, 150], [5, 250], [10, 100], [18, 250]],
  hungaroring: [[1, 250], [2, 150], [12, 100]],
  zandvoort: [[1, 200], [8, 100], [11, 150]],
  monza: [[1, 300], [4, 250], [8, 200], [11, 150]],
  // Madrid is still based on the official project geometry, not an as-built
  // satellite layer. Keep only the unambiguous long approaches provisional.
  madrid: [[1, 150], [4, 200], [14, 150], [21, 200]],
  baku: [[1, 300], [3, 200], [7, 150], [15, 200]],
  singapore: [[1, 150], [7, 150], [13, 100], [16, 150]],
  austin: [[1, 200], [11, 150], [12, 250], [15, 100]],
  'mexico-city': [[1, 300], [4, 200], [12, 100]],
  interlagos: [[1, 200], [4, 200], [10, 100]],
  'las-vegas': [[1, 300], [5, 200], [12, 200], [14, 250]],
  lusail: [[1, 200], [6, 100], [13, 150]],
  'yas-marina': [[1, 150], [6, 250], [9, 200], [14, 150]],
})

export function brakingMarkerProfileFor(trackId) {
  const profile = profiles[trackId]
  if (!profile) throw new Error(`${trackId}: missing v2 braking marker profile`)
  return profile.map(([cornerIndex, maximumDistanceMeters]) => ({
    cornerIndex,
    maximumDistanceMeters,
  }))
}
