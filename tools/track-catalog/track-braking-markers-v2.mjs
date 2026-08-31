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
// Each tuple is [displayed corner number, furthest board distance].  The
// generator emits the descending board sequence (e.g. 150/100/50 m) so the
// driver receives a genuine braking countdown instead of a decorative sign.
// Values are deliberately conservative where a circuit has a short approach.
const profiles = Object.freeze({
  // Albert Park's executable source has 14 physical turns; keep the requested
  // legacy Turn 15 board attached to the final bend without inventing geometry.
  'albert-park': [[1, 150], [3, 150], [6, 200], [11, 200], { cornerIndex: 15, anchorCornerIndex: 14, maximumDistanceMeters: 150 }],
  shanghai: [[1, 200], [6, 150], [11, 200], [14, 250]],
  suzuka: [[1, 150], [8, 200], [11, 150], [13, 200], [16, 200]],
  bahrain: [[1, 250], [4, 200], [8, 150], [9, 250], [10, 100], [11, 200], [13, 200], [14, 200]],
  jeddah: [[1, 200], [4, 200], [13, 300], [16, 200], [22, 250], [27, 200]],
  miami: [[1, 150], [4, 200], [6, 200], [11, 150], [17, 250]],
  montreal: [[1, 150], [3, 200], [6, 150], [8, 200], [10, 250], [13, 200]],
  monaco: [[1, 100], [3, 150], [5, 150], [10, 150], [12, 150], [13, 150], [15, 150]],
  barcelona: [[1, 250], [4, 150], [5, 200], [7, 200], [10, 200], [12, 200]],
  spielberg: [[1, 150], [3, 250], [4, 250], [6, 200], [9, 150], [10, 150]],
  silverstone: [[3, 150], [6, 150], [13, 250], [15, 200], [16, 150]],
  'spa-francorchamps': [[1, 150], [5, 250], [8, 250], [10, 100], [12, 200], [14, 250], [18, 250]],
  hungaroring: [[1, 250], [2, 150], [4, 200], [6, 150], [12, 100], [13, 150]],
  zandvoort: [[1, 200], [2, 200], [8, 100], [9, 150], [11, 150], [13, 150]],
  monza: [[1, 300], [4, 250], [6, 300], [7, 250], [8, 200], [11, 150]],
  // Madrid remains based on the official project geometry rather than an
  // as-built venue.  Corner 21 was removed from the authored list; 20 and 22
  // are the requested approaches on the current project layout.
  madrid: [[1, 150], [4, 200], [8, 200], [10, 200], [14, 150], [17, 200], [20, 200], [22, 200]],
  baku: [[1, 300], [2, 300], [3, 200], [4, 200], [5, 200], [7, 150], [8, 200], [15, 200], [16, 200]],
  // The current Singapore source has 19 physical turns.  The requested legacy
  // labels 20 and 22 are kept as display labels and anchored to the final two
  // authored bends so the catalogue remains faithful to the executable
  // 19-corner geometry (see anchorCornerIndex below).
  singapore: [
    [1, 200], [5, 200], [7, 200], [8, 150], [9, 150], [10, 150],
    [13, 200], [14, 150], [16, 150], [18, 150],
    { cornerIndex: 20, anchorCornerIndex: 18, maximumDistanceMeters: 150 },
    { cornerIndex: 22, anchorCornerIndex: 19, maximumDistanceMeters: 200 },
  ],
  austin: [[1, 200], [7, 250], [11, 150], [12, 250], [15, 100], [19, 200], [20, 200]],
  'mexico-city': [[1, 300], [4, 200], [7, 300], [12, 300]],
  interlagos: [[1, 200], [4, 200], [6, 200], [10, 100], [12, 200]],
  'las-vegas': [[1, 300], [5, 200], [7, 300], [12, 200], [14, 250]],
  lusail: [[1, 200], [4, 200], [6, 100], [7, 200], [10, 150], [12, 150], [13, 150], [14, 200], [15, 200], [16, 200]],
  'yas-marina': [[1, 150], [5, 250], [6, 250], [9, 200], [12, 200], [14, 150], [15, 200]],
})

export function brakingMarkerProfileFor(trackId) {
  const profile = profiles[trackId]
  if (!profile) throw new Error(`${trackId}: missing v2 braking marker profile`)
  return profile.map((entry) => {
    if (Array.isArray(entry)) {
      const [cornerIndex, maximumDistanceMeters] = entry
      return { cornerIndex, maximumDistanceMeters }
    }
    return { ...entry }
  })
}
