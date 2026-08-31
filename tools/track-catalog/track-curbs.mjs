// Curbs are anchored from the canonical geometry using each circuit's official
// turn count. Their colors follow the circuit identity visible in the audited
// FIA/Formula 1 references. Positions remain generated from the same metric
// centerline as physics so visual track limits cannot drift away from the road.
export const trackCurbProfiles = {
  'albert-park': curbProfile(14),
  shanghai: curbProfile(16),
  suzuka: curbProfile(18),
  bahrain: curbProfile(15),
  jeddah: curbProfile(27, { widthMeters: 0.9 }),
  miami: curbProfile(19, { palette: 'orange-white', widthMeters: 1.2 }),
  montreal: curbProfile(14),
  monaco: curbProfile(19, {
    widthMeters: 0.8,
    insideBeforeMeters: 11,
    insideAfterMeters: 13,
    exitLengthMeters: 20,
  }),
  barcelona: curbProfile(14),
  spielberg: curbProfile(10, { widthMeters: 2 }),
  silverstone: curbProfile(18),
  'spa-francorchamps': curbProfile(19, { palette: 'red-yellow' }),
  hungaroring: curbProfile(14),
  zandvoort: curbProfile(14),
  monza: curbProfile(11, { palette: 'green-white-red', widthMeters: 1.2 }),
  madrid: curbProfile(22),
  baku: curbProfile(20, {
    widthMeters: 0.8,
    insideBeforeMeters: 12,
    insideAfterMeters: 14,
    exitLengthMeters: 22,
  }),
  singapore: curbProfile(19, { widthMeters: 0.9 }),
  austin: curbProfile(20, { palette: 'red-white-blue', widthMeters: 1.2 }),
  'mexico-city': curbProfile(17),
  interlagos: curbProfile(15, { palette: 'green-yellow', widthMeters: 1.1 }),
  'las-vegas': curbProfile(17, { widthMeters: 0.9 }),
  lusail: curbProfile(16, { palette: 'maroon-white', widthMeters: 1.2 }),
  'yas-marina': curbProfile(16, { palette: 'blue-white', widthMeters: 1.1 }),
}

function curbProfile(turnCount, options = {}) {
  return {
    turnCount,
    palette: options.palette ?? 'red-white',
    widthMeters: options.widthMeters ?? 1,
    stripeLengthMeters: options.stripeLengthMeters ?? 2.5,
    insideBeforeMeters: options.insideBeforeMeters ?? 16,
    insideAfterMeters: options.insideAfterMeters ?? 20,
    exitStartMeters: options.exitStartMeters ?? 8,
    exitLengthMeters: options.exitLengthMeters ?? 28,
  }
}
