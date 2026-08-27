const curbProfile = (turnCount, options = {}) => ({
  turnCount,
  defaults: {
    palette: options.palette ?? 'red-white',
    widthMeters: options.widthMeters ?? 1,
    stripeLengthMeters: options.stripeLengthMeters ?? 2.4,
    insideBeforeMeters: options.insideBeforeMeters ?? 15,
    insideAfterMeters: options.insideAfterMeters ?? 19,
    exitStartMeters: options.exitStartMeters ?? 7,
    exitLengthMeters: options.exitLengthMeters ?? 26,
    apex: options.apex ?? true,
    exit: options.exit ?? true,
    ...(options.outerColor
      ? {
          outerColor: options.outerColor,
          outerWidthMeters: options.outerWidthMeters ?? 0.35,
        }
      : {}),
  },
  turns: options.turns ?? {},
})

const noCurb = { apex: false, exit: false }
const apexOnly = { apex: true, exit: false }

// The numbered entries below are deliberately authored per venue rather than
// inferred from a global "put two kerbs on every detected bend" rule. Turn
// anchors still come from the canonical metric centerline, while presence,
// width and paint follow the FIA competition notes, promoter maps and official
// circuit material recorded in each TrackDefinition.source.
export const trackCurbProfilesV2 = Object.freeze({
  'albert-park': curbProfile(14, {
    outerColor: '#2f8548',
    turns: {
      3: { widthMeters: 1.35 },
      10: { outerColor: undefined, outerWidthMeters: undefined },
      11: { widthMeters: 1.35 },
      13: { widthMeters: 1.35 },
    },
  }),
  shanghai: curbProfile(16, {
    outerColor: '#2f8b4a',
    turns: { 3: { widthMeters: 0.8 } },
  }),
  suzuka: curbProfile(18, {
    outerColor: '#3976b8',
    outerWidthMeters: 0.32,
    turns: {
      2: { widthMeters: 1.55 },
      8: { widthMeters: 1.55 },
      9: { widthMeters: 1.55 },
    },
  }),
  bahrain: curbProfile(15, {
    widthMeters: 1.05,
    outerColor: '#2f6597',
    outerWidthMeters: 0.28,
  }),
  jeddah: curbProfile(27, {
    widthMeters: 0.78,
    exit: false,
    turns: {
      1: noCurb,
      2: noCurb,
      3: apexOnly,
      4: { ...apexOnly, widthMeters: 0.85 },
      5: noCurb,
      6: noCurb,
      7: noCurb,
      8: { ...apexOnly, widthMeters: 0.85 },
      9: noCurb,
      10: { ...apexOnly, widthMeters: 0.85 },
      11: { ...apexOnly, widthMeters: 0.85 },
      12: noCurb,
      13: noCurb,
      14: apexOnly,
      15: noCurb,
      16: noCurb,
      17: { ...apexOnly, widthMeters: 0.85 },
      18: noCurb,
      19: apexOnly,
      20: apexOnly,
      21: apexOnly,
      22: noCurb,
      23: { ...apexOnly, widthMeters: 0.85 },
      24: noCurb,
      25: noCurb,
      26: noCurb,
      27: noCurb,
    },
  }),
  miami: curbProfile(19, {
    palette: 'orange-white',
    widthMeters: 1.15,
    outerColor: '#1e8d8b',
    outerWidthMeters: 0.28,
  }),
  montreal: curbProfile(14, {
    widthMeters: 1.05,
    outerColor: '#2e8a4d',
    outerWidthMeters: 0.28,
  }),
  monaco: curbProfile(19, {
    widthMeters: 0.72,
    insideBeforeMeters: 10,
    insideAfterMeters: 12,
    exitLengthMeters: 17,
    exit: false,
    turns: {
      1: { apex: true, exit: true },
      2: noCurb,
      3: noCurb,
      4: noCurb,
      5: apexOnly,
      6: noCurb,
      7: noCurb,
      8: noCurb,
      9: noCurb,
      10: { apex: true, exit: true, widthMeters: 0.85 },
      11: { apex: true, exit: true, widthMeters: 0.85 },
      12: noCurb,
      13: { apex: true, exit: true, widthMeters: 0.9 },
      14: { apex: true, exit: true, widthMeters: 0.9 },
      15: { apex: true, exit: true, widthMeters: 0.9 },
      16: { apex: true, exit: true, widthMeters: 0.9 },
      17: noCurb,
      18: apexOnly,
      19: { apex: true, exit: true },
    },
  }),
  barcelona: curbProfile(14, {
    widthMeters: 1.1,
    outerColor: '#2e8d48',
    outerWidthMeters: 0.4,
  }),
  spielberg: curbProfile(10, {
    widthMeters: 1.45,
    outerColor: '#367ac0',
    outerWidthMeters: 0.42,
    turns: {
      1: { widthMeters: 0.75 },
      3: { widthMeters: 0.75 },
      4: { widthMeters: 0.75 },
      6: { widthMeters: 0.75 },
      9: { widthMeters: 1.65 },
      10: { widthMeters: 1.65 },
    },
  }),
  silverstone: curbProfile(18, {
    widthMeters: 1.05,
    turns: {
      1: { widthMeters: 0.78 },
      6: { widthMeters: 0.78 },
      7: { widthMeters: 0.78 },
      9: { widthMeters: 0.78 },
      18: { exit: false },
    },
  }),
  'spa-francorchamps': curbProfile(19, {
    palette: 'red-yellow',
    widthMeters: 1.1,
    stripeLengthMeters: 2.7,
  }),
  hungaroring: curbProfile(14, {
    widthMeters: 1.05,
    outerColor: '#2f8b49',
    outerWidthMeters: 0.3,
  }),
  zandvoort: curbProfile(14, {
    widthMeters: 1.15,
    stripeLengthMeters: 2.2,
    turns: {
      3: { widthMeters: 1.45 },
      14: { widthMeters: 1.35 },
    },
  }),
  monza: curbProfile(11, {
    widthMeters: 1.1,
    outerColor: '#198f50',
    outerWidthMeters: 0.45,
    turns: {
      1: { widthMeters: 1.3 },
      2: { widthMeters: 1.3 },
      4: { widthMeters: 1.25 },
      5: { widthMeters: 1.25 },
    },
  }),
  madrid: curbProfile(22, {
    palette: 'red-yellow',
    widthMeters: 1.05,
    turns: { 12: { widthMeters: 1.4 } },
  }),
  baku: curbProfile(20, {
    widthMeters: 0.72,
    insideBeforeMeters: 10,
    insideAfterMeters: 13,
    exitLengthMeters: 18,
    turns: {
      8: { exit: false, widthMeters: 0.62 },
      9: { exit: false, widthMeters: 0.62 },
      10: { exit: false, widthMeters: 0.62 },
      11: { exit: false, widthMeters: 0.62 },
      12: { exit: false, widthMeters: 0.62 },
    },
  }),
  singapore: curbProfile(19, {
    widthMeters: 0.78,
    insideBeforeMeters: 11,
    insideAfterMeters: 14,
    exitLengthMeters: 20,
  }),
  austin: curbProfile(20, {
    widthMeters: 1.1,
    outerColor: '#2e6db6',
    outerWidthMeters: 0.52,
  }),
  'mexico-city': curbProfile(17, {
    widthMeters: 1.05,
    outerColor: '#218b4b',
    outerWidthMeters: 0.4,
  }),
  interlagos: curbProfile(15, {
    palette: 'green-yellow',
    widthMeters: 1.05,
    stripeLengthMeters: 2.2,
  }),
  'las-vegas': curbProfile(17, {
    widthMeters: 0.72,
    insideBeforeMeters: 11,
    insideAfterMeters: 14,
    exitLengthMeters: 20,
  }),
  lusail: curbProfile(16, {
    palette: 'maroon-white',
    widthMeters: 1.15,
    outerColor: '#2d6da1',
    outerWidthMeters: 0.3,
  }),
  'yas-marina': curbProfile(16, {
    palette: 'blue-white',
    widthMeters: 1.1,
    outerColor: '#63a7d8',
    outerWidthMeters: 0.35,
  }),
})

export function curbFidelityProfileFor(trackId) {
  const profile = trackCurbProfilesV2[trackId]
  if (!profile) throw new Error(`${trackId}: missing v2 curb fidelity profile`)
  return profile
}
