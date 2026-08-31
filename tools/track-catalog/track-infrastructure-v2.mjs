const pitVisual = (
  architecture,
  primaryColor,
  secondaryColor,
  accentColor,
  roofColor,
  garageCount = 10,
  buildingHeightMeters = 4.2,
  layout = {},
) => ({
  architecture,
  primaryColor,
  secondaryColor,
  accentColor,
  roofColor,
  garageCount,
  buildingHeightMeters,
  laneWidthMeters: layout.laneWidthMeters ?? 10,
  garageStartRatio: layout.garageStartRatio ?? 0.23,
  garageEndRatio: layout.garageEndRatio ?? 0.77,
  pitBoxLengthMeters: layout.pitBoxLengthMeters ?? 7.5,
  pitBoxDepthMeters: layout.pitBoxDepthMeters ?? 2.6,
  pitBoxCenterOffsetMeters: layout.pitBoxCenterOffsetMeters ?? 2.4,
  garageDepthMeters: layout.garageDepthMeters ?? 8,
  garageCenterOffsetMeters: layout.garageCenterOffsetMeters ?? 10,
  pitWallHeightMeters: layout.pitWallHeightMeters ?? 1,
  canopyDepthMeters: layout.canopyDepthMeters ?? 1.2,
})

const structureDimensions = (kind, scale, explicit) => {
  if (explicit) return explicit
  if (kind.includes('grandstand')) {
    return {
      lengthMeters: Number((scale * 1.65).toFixed(2)),
      depthMeters: Number((scale * 0.82).toFixed(2)),
      heightMeters: Number((scale * 0.42).toFixed(2)),
    }
  }
  if (kind.includes('tower')) {
    return {
      lengthMeters: Number((scale * 0.65).toFixed(2)),
      depthMeters: Number((scale * 0.65).toFixed(2)),
      heightMeters: Number((scale * 1.8).toFixed(2)),
    }
  }
  return {
    lengthMeters: Number((scale * 1.35).toFixed(2)),
    depthMeters: Number((scale * 0.82).toFixed(2)),
    heightMeters: Number((scale * 0.62).toFixed(2)),
  }
}

const structure = (
  id,
  kind,
  fraction,
  side,
  offsetMeters,
  scale,
  primaryColor,
  secondaryColor,
  accentColor,
  roofColor,
  rotationOffset = 0,
  dimensions,
) => ({
  id,
  kind,
  fraction,
  side,
  offsetMeters,
  scale,
  rotationOffset,
  dimensions: structureDimensions(kind, scale, dimensions),
  visualStyle: { primaryColor, secondaryColor, accentColor, roofColor },
})

const fenceVisual = (
  heightMeters,
  postSpacingMeters,
  postColor,
  meshColor,
  meshOpacity,
  cantileverMeters = 0,
) => ({
  heightMeters,
  postSpacingMeters,
  postColor,
  meshColor,
  meshOpacity,
  cantileverMeters,
})

const galvanizedFence = fenceVisual(3.2, 3, '#87929d', '#697786', 0.22, 0.2)
const tallStreetFence = fenceVisual(4.2, 2.5, '#535e69', '#47535f', 0.28, 0.55)

const fenceVisualProfilesV2 = Object.freeze({
  'albert-park': fenceVisual(3.5, 2.8, '#77838e', '#65727e', 0.23, 0.25),
  shanghai: fenceVisual(3.6, 3, '#7b8792', '#66737f', 0.22, 0.3),
  suzuka: fenceVisual(3.4, 2.8, '#858f98', '#707b85', 0.2, 0.25),
  bahrain: fenceVisual(3.4, 3, '#716f6b', '#625f5a', 0.23, 0.25),
  jeddah: fenceVisual(4.5, 2.35, '#4f5963', '#414b55', 0.3, 0.65),
  miami: fenceVisual(4.3, 2.4, '#586772', '#465660', 0.29, 0.6),
  montreal: galvanizedFence,
  monaco: fenceVisual(4.1, 2.25, '#555f68', '#454f58', 0.3, 0.7),
  barcelona: galvanizedFence,
  spielberg: galvanizedFence,
  silverstone: fenceVisual(3.5, 3, '#747f89', '#626f7a', 0.22, 0.25),
  'spa-francorchamps': galvanizedFence,
  hungaroring: fenceVisual(3.5, 2.8, '#7b858e', '#66717b', 0.22, 0.3),
  zandvoort: fenceVisual(3.7, 2.7, '#737f89', '#5f6c77', 0.24, 0.4),
  monza: galvanizedFence,
  madrid: tallStreetFence,
  baku: fenceVisual(4.5, 2.25, '#4d5861', '#414b54', 0.31, 0.65),
  singapore: fenceVisual(4.5, 2.3, '#4e5963', '#414c56', 0.31, 0.65),
  austin: fenceVisual(3.6, 2.8, '#75818b', '#616e79', 0.23, 0.3),
  'mexico-city': fenceVisual(3.6, 2.8, '#758079', '#626e67', 0.23, 0.3),
  interlagos: fenceVisual(3.7, 2.7, '#6f7b76', '#5c6963', 0.24, 0.35),
  'las-vegas': fenceVisual(4.5, 2.3, '#4b555f', '#3f4953', 0.31, 0.65),
  lusail: fenceVisual(3.8, 2.7, '#66737e', '#53616d', 0.24, 0.4),
  'yas-marina': fenceVisual(3.9, 2.6, '#64727d', '#52606c', 0.25, 0.45),
})

const profile = ({
  pitSide = 'right',
  pitEntryFraction = 0.91,
  pitExitFraction = 0.09,
  pitOffsetMeters = 5.5,
  startOffsetMeters,
  pit,
  structures,
}) => ({
  pitSide,
  pitEntryFraction,
  pitExitFraction,
  pitOffsetMeters,
  ...(startOffsetMeters === undefined ? {} : { startOffsetMeters }),
  pitVisual: pit,
  structures,
})

// Authored against the official circuit/pit drawings and promoter venue maps
// listed in each generated TrackDefinition.source.environmentReferences. The
// objects intentionally cover track infrastructure only: pit complex, major
// start-area buildings and real spectator stands. Logos and unrelated scenery
// are omitted so these remain original Never Lift illustrations.
export const trackInfrastructureProfilesV2 = Object.freeze({
  'albert-park': profile({
    pit: pitVisual('temporary-modular', '#d9dde2', '#596674', '#1268a9', '#f4f5f6', 11, 3.8),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'left', 38, 17, '#46515c', '#c8ced5', '#1268a9', '#e8ebee'),
      structure('jones-grandstand', 'grandstand-open', 0.025, 'left', 42, 13, '#58636d', '#b8c0c8', '#1268a9', '#dce0e4'),
      structure('race-control', 'race-control-building', 0.992, 'right', 25, 11, '#d9dde2', '#596674', '#1268a9', '#f4f5f6'),
    ],
  }),
  shanghai: profile({
    pit: pitVisual('permanent-modern', '#d7d9dc', '#444d57', '#b51e2a', '#eef0f2', 12, 5.4),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.97, 'left', 43, 20, '#a41f2a', '#d8dadd', '#b79a4a', '#e9eaec'),
      structure('lotus-grandstand', 'grandstand-covered', 0.04, 'left', 53, 17, '#a41f2a', '#d8dadd', '#b79a4a', '#e9eaec'),
      structure('paddock-pavilion', 'paddock-building', 0.99, 'right', 30, 13, '#d7d9dc', '#444d57', '#b51e2a', '#eef0f2'),
    ],
  }),
  suzuka: profile({
    pit: pitVisual('permanent-modern', '#f0f0ef', '#4b5158', '#b5222a', '#d9dddf', 11, 4.8),
    structures: [
      structure('v-grandstand', 'main-grandstand-covered', 0.965, 'left', 41, 19, '#a91f27', '#e7e8e8', '#363d45', '#f3f3f2'),
      structure('turn-one-grandstand', 'grandstand-covered', 0.035, 'left', 48, 14, '#a91f27', '#e7e8e8', '#363d45', '#f3f3f2'),
      structure('suzuka-race-control', 'race-control-building', 0.988, 'right', 25, 12, '#f0f0ef', '#4b5158', '#b5222a', '#d9dddf'),
    ],
  }),
  bahrain: profile({
    pit: pitVisual('desert-canopy', '#e5dfcf', '#6a6255', '#8d2633', '#f0eadc', 12, 4.8),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'left', 45, 20, '#d9d0bd', '#6f665a', '#8d2633', '#f2ecdf'),
      structure('turn-one-grandstand', 'grandstand-canopy', 0.06, 'left', 54, 16, '#d9d0bd', '#6f665a', '#8d2633', '#f2ecdf'),
      structure('sakhir-tower', 'pit-control-tower', 0.015, 'right', 31, 10, '#d8cfbc', '#5d584f', '#8d2633', '#eee7d8'),
    ],
  }),
  jeddah: profile({
    pitSide: 'left',
    pit: pitVisual('stepped-modern', '#eef0ed', '#586068', '#207a68', '#f6f7f4', 12, 6.2),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'right', 35, 17, '#e5e8e5', '#59636b', '#207a68', '#f5f6f3'),
      structure('central-grandstand', 'grandstand-covered', 0.2, 'right', 38, 14, '#e5e8e5', '#59636b', '#207a68', '#f5f6f3'),
      structure('pit-team-building', 'race-control-building', 0.99, 'left', 26, 15, '#eef0ed', '#586068', '#207a68', '#f6f7f4'),
    ],
  }),
  miami: profile({
    pit: pitVisual('temporary-modular', '#eef0ef', '#5b6670', '#287f82', '#f8f8f5', 11, 4.2),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.97, 'right', 41, 17, '#e9ecea', '#59646c', '#287f82', '#f7f7f4'),
      structure('turn-one-grandstand', 'grandstand-covered', 0.04, 'left', 46, 14, '#e9ecea', '#59646c', '#287f82', '#f7f7f4'),
      structure('hard-rock-stadium', 'stadium-building', 0.12, 'left', 59, 24, '#c8cccb', '#515a62', '#287f82', '#e5e7e5'),
    ],
  }),
  montreal: profile({
    pit: pitVisual('permanent-modern', '#dfe3e5', '#59636c', '#246298', '#f1f3f3', 10, 4.4),
    structures: [
      structure('platine-grandstand', 'main-grandstand-covered', 0.975, 'left', 39, 16, '#d4d9dc', '#59636c', '#246298', '#eff1f2'),
      structure('senna-grandstand', 'grandstand-open', 0.04, 'left', 43, 14, '#d4d9dc', '#59636c', '#246298', '#eff1f2'),
      structure('paddock-building', 'paddock-building', 0.99, 'right', 26, 11, '#dfe3e5', '#59636c', '#246298', '#f1f3f3'),
    ],
  }),
  monaco: profile({
    startOffsetMeters: 2429.5,
    pitEntryFraction: 0.9,
    pitExitFraction: 0.085,
    pitOffsetMeters: 4.6,
    pit: pitVisual('urban-compact', '#e4e5e4', '#4f555c', '#b22a34', '#f3f3f0', 9, 3.7),
    structures: [
      structure('grandstand-k', 'main-grandstand-covered', 0.96, 'left', 24, 13, '#d6d8d8', '#535a62', '#b22a34', '#efefed'),
      structure('swimming-pool-grandstand', 'grandstand-open', 0.42, 'left', 24, 11, '#d6d8d8', '#535a62', '#b22a34', '#efefed'),
      structure('monaco-pit-control', 'race-control-building', 0.99, 'right', 20, 9, '#e4e5e4', '#4f555c', '#b22a34', '#f3f3f0'),
    ],
  }),
  barcelona: profile({
    pit: pitVisual('permanent-modern', '#d9dcdf', '#505a64', '#b12b33', '#eceeef', 12, 5.1),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'left', 44, 20, '#d3d7da', '#4f5963', '#b12b33', '#edeff0'),
      structure('turn-one-grandstand', 'grandstand-open', 0.04, 'left', 48, 14, '#d3d7da', '#4f5963', '#b12b33', '#edeff0'),
      structure('pit-building', 'race-control-building', 0.99, 'right', 25, 13, '#d9dcdf', '#505a64', '#b12b33', '#eceeef'),
    ],
  }),
  spielberg: profile({
    pit: pitVisual('permanent-modern', '#dfe1e2', '#4d555d', '#9f2830', '#f0f1f1', 10, 4.6),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'left', 43, 18, '#d8dbdc', '#525b63', '#9f2830', '#eff0f0'),
      structure('turn-one-grandstand', 'grandstand-open', 0.08, 'left', 46, 14, '#d8dbdc', '#525b63', '#9f2830', '#eff0f0'),
      structure('race-control', 'race-control-building', 0.99, 'right', 25, 11, '#dfe1e2', '#4d555d', '#9f2830', '#f0f1f1'),
    ],
  }),
  silverstone: profile({
    // The executable source starts at the old loop's Turn 8/9 transition.
    // F1 uses the Hamilton Straight between Club (Turn 18) and Abbey (Turn 1)
    // for the grid and pit lane.  The 3200 m source offset places lap zero on
    // that straight, with the Wing garages and pit transitions on the same
    // physical approach.
    startOffsetMeters: 3200,
    pit: pitVisual('wing', '#d7dadc', '#373e45', '#8b2730', '#edf0f1', 12, 6.3),
    structures: [
      structure('silverstone-wing', 'silverstone-wing-building', 0.025, 'right', 35, 22, '#d7dadc', '#373e45', '#8b2730', '#edf0f1'),
      structure('international-pits-straight', 'main-grandstand-covered', 0.975, 'left', 46, 19, '#cfd4d7', '#464e56', '#8b2730', '#e8ebed'),
      structure('abbey-grandstand', 'grandstand-open', 0.06, 'left', 51, 14, '#cfd4d7', '#464e56', '#8b2730', '#e8ebed'),
    ],
  }),
  'spa-francorchamps': profile({
    pit: pitVisual('heritage', '#d7d9d8', '#50575d', '#8d2530', '#e9ebea', 10, 4.3),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'left', 39, 17, '#d0d3d3', '#50585f', '#8d2530', '#e8eaea'),
      structure('raidillon-grandstand', 'grandstand-hillside', 0.83, 'right', 53, 17, '#d0d3d3', '#50585f', '#8d2530', '#e8eaea'),
      structure('spa-pit-building', 'race-control-building', 0.99, 'right', 25, 11, '#d7d9d8', '#50575d', '#8d2530', '#e9ebea'),
    ],
  }),
  hungaroring: profile({
    pit: pitVisual('permanent-modern', '#dedfdf', '#515960', '#8e2730', '#eff0ef', 10, 4.8),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.97, 'left', 41, 18, '#d7d9d9', '#535b62', '#8e2730', '#edeeee'),
      structure('turn-one-grandstand', 'grandstand-open', 0.05, 'left', 46, 14, '#d7d9d9', '#535b62', '#8e2730', '#edeeee'),
      structure('race-control', 'race-control-building', 0.99, 'right', 25, 11, '#dedfdf', '#515960', '#8e2730', '#eff0ef'),
    ],
  }),
  zandvoort: profile({
    pit: pitVisual('heritage', '#d9dbd9', '#4f565d', '#a34d21', '#eceeec', 10, 4.2),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.98, 'left', 39, 17, '#d1d4d2', '#50585f', '#a34d21', '#e9ebe9'),
      structure('tarzan-grandstand', 'grandstand-open', 0.055, 'left', 43, 14, '#d1d4d2', '#50585f', '#a34d21', '#e9ebe9'),
      structure('pit-building', 'race-control-building', 0.99, 'right', 66, 10, '#d9dbd9', '#4f565d', '#a34d21', '#eceeec'),
    ],
  }),
  monza: profile({
    pit: pitVisual('heritage', '#dedfdd', '#50565c', '#9d2630', '#efefed', 11, 4.5),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'left', 41, 18, '#d6d8d6', '#51585e', '#9d2630', '#ececea'),
      structure('rettifilo-grandstand', 'grandstand-open', 0.05, 'left', 47, 14, '#d6d8d6', '#51585e', '#9d2630', '#ececea'),
      structure('monza-pit-tower', 'pit-control-tower', 0.99, 'right', 25, 10, '#dedfdd', '#50565c', '#9d2630', '#efefed'),
    ],
  }),
  madrid: profile({
    pit: pitVisual('exhibition', '#e2e3e1', '#4f575f', '#9b2933', '#f0f0ed', 12, 5.6),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.97, 'left', 39, 18, '#d8dad8', '#515a62', '#9b2933', '#ededeb'),
      structure('ifema-pavilion', 'ifema-exhibition-building', 0.16, 'right', 59, 22, '#dedfdd', '#4c555e', '#9b2933', '#efefec'),
      structure('race-control', 'race-control-building', 0.99, 'right', 25, 12, '#e2e3e1', '#4f575f', '#9b2933', '#f0f0ed'),
    ],
  }),
  baku: profile({
    pitSide: 'left',
    pit: pitVisual('urban-compact', '#e3e5e4', '#505961', '#286682', '#f0f2f0', 11, 4.6),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'right', 29, 16, '#d8dcdb', '#515b63', '#286682', '#eef0ee'),
      structure('turn-one-grandstand', 'grandstand-open', 0.035, 'right', 33, 12, '#d8dcdb', '#515b63', '#286682', '#eef0ee'),
      structure('baku-pit-building', 'race-control-building', 0.99, 'left', 24, 11, '#e3e5e4', '#505961', '#286682', '#f0f2f0'),
    ],
  }),
  singapore: profile({
    pit: pitVisual('urban-compact', '#d8dadd', '#414952', '#982b34', '#eceeef', 11, 5.2),
    structures: [
      structure('super-pit-grandstand', 'main-grandstand-covered', 0.97, 'left', 31, 18, '#d1d5d8', '#444d56', '#982b34', '#e9ecee'),
      structure('turn-one-grandstand', 'grandstand-covered', 0.035, 'left', 35, 13, '#d1d5d8', '#444d56', '#982b34', '#e9ecee'),
      structure('singapore-pit-building', 'race-control-building', 0.99, 'right', 23, 12, '#d8dadd', '#414952', '#982b34', '#eceeef'),
    ],
  }),
  austin: profile({
    pit: pitVisual('permanent-modern', '#d9dcdd', '#4e5760', '#8f2933', '#eceeef', 11, 5.0),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'left', 43, 18, '#d2d6d7', '#505a63', '#8f2933', '#eaeced'),
      structure('turn-one-grandstand', 'grandstand-hillside', 0.06, 'right', 52, 15, '#d2d6d7', '#505a63', '#8f2933', '#eaeced'),
      structure('cota-race-control', 'race-control-building', 0.99, 'right', 25, 11, '#d9dcdd', '#4e5760', '#8f2933', '#eceeef'),
    ],
  }),
  'mexico-city': profile({
    pit: pitVisual('stadium', '#d9dcda', '#4f585f', '#49735f', '#eceeeb', 11, 4.8),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.98, 'left', 39, 18, '#d1d5d2', '#515a61', '#49735f', '#e9ece9'),
      structure('foro-sol', 'foro-sol-grandstand', 0.24, 'left', 37, 23, '#d1d5d2', '#515a61', '#8c3440', '#e9ece9'),
      structure('pit-building', 'race-control-building', 0.99, 'right', 24, 11, '#d9dcda', '#4f585f', '#49735f', '#eceeeb'),
    ],
  }),
  interlagos: profile({
    pitSide: 'left',
    pit: pitVisual('heritage', '#d9d9d6', '#4d545a', '#8f2931', '#ebebe8', 10, 4.3),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'right', 39, 18, '#d1d2cf', '#50575d', '#8f2931', '#e8e8e5'),
      structure('senna-s-grandstand', 'grandstand-hillside', 0.05, 'right', 45, 14, '#d1d2cf', '#50575d', '#8f2931', '#e8e8e5'),
      structure('interlagos-pit-complex', 'race-control-building', 0.99, 'left', 24, 12, '#d9d9d6', '#4d545a', '#8f2931', '#ebebe8'),
    ],
  }),
  'las-vegas': profile({
    pitSide: 'left',
    pit: pitVisual('permanent-modern', '#d9dad8', '#333941', '#8f6e32', '#ecece9', 12, 5.7),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.97, 'right', 31, 18, '#d2d4d2', '#373e45', '#8f6e32', '#e9eae7'),
      structure('sphere-zone-grandstand', 'grandstand-covered', 0.18, 'right', 43, 14, '#d2d4d2', '#373e45', '#8f6e32', '#e9eae7'),
      structure('las-vegas-pit-building', 'race-control-building', 0.99, 'left', 25, 14, '#d9dad8', '#333941', '#8f6e32', '#ecece9'),
    ],
  }),
  lusail: profile({
    pit: pitVisual('desert-canopy', '#e2e0da', '#505a62', '#315f83', '#f0eee8', 12, 5.2),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.975, 'left', 43, 20, '#d9d7d1', '#525c64', '#315f83', '#edebe5'),
      structure('north-grandstand', 'grandstand-covered', 0.05, 'left', 48, 15, '#d9d7d1', '#525c64', '#315f83', '#edebe5'),
      structure('lusail-pit-building', 'race-control-building', 0.99, 'right', 27.9, 12, '#e2e0da', '#505a62', '#315f83', '#f0eee8'),
    ],
  }),
  'yas-marina': profile({
    pit: pitVisual('marina-canopy', '#e2e4e3', '#4d5861', '#2f6783', '#f0f1ee', 12, 5.4),
    structures: [
      structure('main-grandstand', 'main-grandstand-covered', 0.97, 'left', 43, 19, '#d9dcda', '#505b64', '#2f6783', '#edefec'),
      structure('north-grandstand', 'grandstand-covered', 0.08, 'left', 48, 15, '#d9dcda', '#505b64', '#2f6783', '#edefec'),
      structure('yas-pit-building', 'race-control-building', 0.99, 'right', 25, 12, '#e2e4e3', '#4d5861', '#2f6783', '#f0f1ee'),
    ],
  }),
})

const supplementalGrandstand = (
  id,
  fraction,
  side,
  offsetMeters,
  scale,
  kind = 'grandstand-open',
) => ({ id, fraction, side, offsetMeters, scale, kind })

// Additional spectator zones placed from the official venue maps. These are
// deliberately named after their sector/location rather than carrying sponsor
// artwork, keeping the illustrations original while preserving each venue's
// recognizable distribution of grandstands.
const supplementaryGrandstandsV2 = Object.freeze({
  'albert-park': [
    supplementalGrandstand('fangio-grandstand', 0.11, 'left', 44, 13, 'grandstand-covered'),
    supplementalGrandstand('prost-grandstand', 0.87, 'right', 46, 12),
  ],
  shanghai: [
    supplementalGrandstand('turn-one-grandstand', 0.13, 'right', 50.1, 15, 'grandstand-covered'),
    supplementalGrandstand('hairpin-grandstand', 0.82, 'left', 74.3, 13),
  ],
  suzuka: [
    supplementalGrandstand('s-curves-grandstand', 0.19, 'right', 46, 13),
    supplementalGrandstand('spoon-grandstand', 0.63, 'left', 49, 13, 'grandstand-hillside'),
  ],
  bahrain: [
    supplementalGrandstand('university-grandstand', 0.21, 'right', 52, 14, 'grandstand-canopy'),
    supplementalGrandstand('victory-grandstand', 0.79, 'left', 49, 13, 'grandstand-canopy'),
  ],
  jeddah: [
    supplementalGrandstand('turn-one-grandstand', 0.05, 'right', 52, 13, 'grandstand-covered'),
    supplementalGrandstand('turn-twenty-seven-grandstand', 0.89, 'right', 36, 13),
  ],
  miami: [
    supplementalGrandstand('marina-grandstand', 0.31, 'left', 44, 14, 'grandstand-covered'),
    supplementalGrandstand('beach-grandstand', 0.69, 'right', 45, 13),
  ],
  montreal: [
    supplementalGrandstand('hairpin-grandstand', 0.56, 'left', 42, 14, 'grandstand-covered'),
    supplementalGrandstand('wall-of-champions-grandstand', 0.9, 'right', 39, 12),
  ],
  monaco: [
    supplementalGrandstand('casino-grandstand', 0.3, 'right', 23, 10),
    supplementalGrandstand('harbour-grandstand', 0.67, 'left', 22, 11, 'grandstand-covered'),
  ],
  barcelona: [
    supplementalGrandstand('stadium-grandstand', 0.61, 'left', 48, 15, 'grandstand-covered'),
    supplementalGrandstand('final-corner-grandstand', 0.87, 'right', 46, 13),
  ],
  spielberg: [
    supplementalGrandstand('north-grandstand', 0.25, 'left', 50, 14, 'grandstand-hillside'),
    supplementalGrandstand('southwest-grandstand', 0.72, 'right', 48, 13),
  ],
  silverstone: [
    supplementalGrandstand('becketts-grandstand', 0.34, 'left', 51, 15, 'grandstand-covered'),
    supplementalGrandstand('stowe-grandstand', 0.73, 'right', 50, 14),
  ],
  'spa-francorchamps': [
    supplementalGrandstand('eau-rouge-grandstand', 0.08, 'left', 49, 14, 'grandstand-hillside'),
    supplementalGrandstand('les-combes-grandstand', 0.31, 'right', 52, 13, 'grandstand-hillside'),
  ],
  hungaroring: [
    supplementalGrandstand('east-turn-one-grandstand', 0.08, 'right', 47, 14, 'grandstand-covered'),
    supplementalGrandstand('final-sector-grandstand', 0.88, 'left', 46, 13),
  ],
  zandvoort: [
    supplementalGrandstand('arena-grandstand', 0.48, 'left', 44, 15, 'grandstand-covered'),
    supplementalGrandstand('eastside-grandstand', 0.67, 'right', 78, 13),
  ],
  monza: [
    supplementalGrandstand('ascari-grandstand', 0.68, 'right', 48, 13),
    supplementalGrandstand('parabolica-grandstand', 0.87, 'left', 47, 15, 'grandstand-covered'),
  ],
  madrid: [
    supplementalGrandstand('ifema-turn-one-grandstand', 0.08, 'right', 38, 14, 'grandstand-covered'),
    supplementalGrandstand('banked-corner-grandstand', 0.71, 'left', 43, 15, 'grandstand-covered'),
  ],
  baku: [
    supplementalGrandstand('sahil-grandstand', 0.13, 'right', 31, 12, 'grandstand-covered'),
    supplementalGrandstand('old-city-grandstand', 0.51, 'left', 27, 10),
  ],
  singapore: [
    supplementalGrandstand('padang-grandstand', 0.36, 'right', 34, 14, 'grandstand-covered'),
    supplementalGrandstand('connaught-grandstand', 0.52, 'left', 33, 12),
  ],
  austin: [
    supplementalGrandstand('turn-twelve-grandstand', 0.54, 'right', 50, 14),
    supplementalGrandstand('turn-fifteen-grandstand', 0.71, 'right', 47, 14, 'grandstand-covered'),
  ],
  'mexico-city': [
    supplementalGrandstand('turn-one-grandstand', 0.08, 'right', 42, 14, 'grandstand-covered'),
    supplementalGrandstand('esses-grandstand', 0.52, 'left', 45, 12),
  ],
  interlagos: [
    supplementalGrandstand('sector-a-grandstand', 0.09, 'right', 42, 14, 'grandstand-covered'),
    supplementalGrandstand('sector-m-grandstand', 0.72, 'left', 43, 13),
  ],
  'las-vegas': [
    supplementalGrandstand('east-harmon-grandstand', 0.08, 'right', 32, 14, 'grandstand-covered'),
    supplementalGrandstand('koval-grandstand', 0.46, 'left', 31, 12),
  ],
  lusail: [
    supplementalGrandstand('turn-two-grandstand', 0.12, 'right', 46, 14, 'grandstand-covered'),
    supplementalGrandstand('final-corner-grandstand', 0.89, 'left', 46, 13),
  ],
  'yas-marina': [
    supplementalGrandstand('west-grandstand', 0.29, 'right', 45, 15, 'grandstand-covered'),
    supplementalGrandstand('marina-grandstand', 0.68, 'left', 45, 14, 'grandstand-covered'),
  ],
})

const pitLayout = ({
  laneWidthMeters,
  garageDepthMeters,
  buildingHeightMeters,
  pitOffsetMeters,
  pitEntryFraction = 0.91,
  pitExitFraction = 0.09,
  garageCenterRatio = 0.5,
  garageStartRatio = 0.2,
  garageEndRatio = 0.8,
  pitBoxLengthMeters = 7.5,
  pitBoxDepthMeters = 2.6,
  pitBoxCenterOffsetMeters = laneWidthMeters * 0.22,
  pitWallHeightMeters = 1,
  canopyDepthMeters = 1.2,
}) => ({
  // Two visual bays per each of the 11 2026 teams.
  garageCount: 22,
  laneWidthMeters,
  garageStartRatio,
  garageEndRatio,
  pitBoxLengthMeters,
  pitBoxDepthMeters,
  pitBoxCenterOffsetMeters,
  garageDepthMeters,
  garageCenterOffsetMeters: laneWidthMeters / 2 + garageDepthMeters / 2 + 1,
  pitWallHeightMeters,
  canopyDepthMeters,
  buildingHeightMeters,
  pitOffsetMeters,
  pitEntryFraction,
  pitExitFraction,
  pitGarageCenterRatio: garageCenterRatio,
})

// Dimensions are in world metres. Where a venue publishes a full building
// footprint, the garage depth deliberately stays below that total so the
// façade, circulation and hospitality floors can be represented separately.
const pitLayoutsV2 = Object.freeze({
  'albert-park': pitLayout({ laneWidthMeters: 14, garageDepthMeters: 10, buildingHeightMeters: 8, pitOffsetMeters: 9.2, pitEntryFraction: 0.928, pitExitFraction: 0.054, garageCenterRatio: 0.53, canopyDepthMeters: 1.8 }),
  shanghai: pitLayout({ laneWidthMeters: 12.5, garageDepthMeters: 12, buildingHeightMeters: 14, pitOffsetMeters: 8.4, pitEntryFraction: 0.955, pitExitFraction: 0.041, garageCenterRatio: 0.49, canopyDepthMeters: 2.2 }),
  suzuka: pitLayout({ laneWidthMeters: 12, garageDepthMeters: 10.5, buildingHeightMeters: 9.5, pitOffsetMeters: 8.1, pitEntryFraction: 0.949, pitExitFraction: 0.038, garageCenterRatio: 0.52, canopyDepthMeters: 1.5 }),
  bahrain: pitLayout({ laneWidthMeters: 12, garageDepthMeters: 11, buildingHeightMeters: 14, pitOffsetMeters: 8.2, pitEntryFraction: 0.957, pitExitFraction: 0.035, garageCenterRatio: 0.5, canopyDepthMeters: 3 }),
  jeddah: pitLayout({ laneWidthMeters: 12, garageDepthMeters: 12.5, buildingHeightMeters: 18, pitOffsetMeters: 8.3, pitEntryFraction: 0.965, pitExitFraction: 0.028, garageCenterRatio: 0.51, canopyDepthMeters: 2.6 }),
  miami: pitLayout({ laneWidthMeters: 12, garageDepthMeters: 10, buildingHeightMeters: 12, pitOffsetMeters: 8.1, pitEntryFraction: 0.943, pitExitFraction: 0.045, garageCenterRatio: 0.52, canopyDepthMeters: 2 }),
  montreal: pitLayout({ laneWidthMeters: 10, garageDepthMeters: 9, buildingHeightMeters: 12, pitOffsetMeters: 7.1, pitEntryFraction: 0.932, pitExitFraction: 0.042, garageCenterRatio: 0.54, canopyDepthMeters: 1.5 }),
  monaco: pitLayout({ laneWidthMeters: 8.5, garageDepthMeters: 7, buildingHeightMeters: 13, pitOffsetMeters: 5.4, pitEntryFraction: 0.9, pitExitFraction: 0.085, garageCenterRatio: 0.51, garageStartRatio: 0.17, garageEndRatio: 0.84, pitBoxLengthMeters: 6.4, pitBoxDepthMeters: 2.2, canopyDepthMeters: 2.4 }),
  barcelona: pitLayout({ laneWidthMeters: 13, garageDepthMeters: 11, buildingHeightMeters: 14, pitOffsetMeters: 8.7, pitEntryFraction: 0.956, pitExitFraction: 0.031, garageCenterRatio: 0.49, canopyDepthMeters: 1.8 }),
  spielberg: pitLayout({ laneWidthMeters: 12, garageDepthMeters: 12.5, buildingHeightMeters: 12, pitOffsetMeters: 8.3, pitEntryFraction: 0.949, pitExitFraction: 0.041, garageCenterRatio: 0.5, canopyDepthMeters: 2 }),
  silverstone: pitLayout({ laneWidthMeters: 14, garageDepthMeters: 14, buildingHeightMeters: 18, pitOffsetMeters: 9.3, pitEntryFraction: 0.946, pitExitFraction: 0.046, garageCenterRatio: 0.5, canopyDepthMeters: 2.4 }),
  'spa-francorchamps': pitLayout({ laneWidthMeters: 12, garageDepthMeters: 10, buildingHeightMeters: 11, pitOffsetMeters: 8.1, pitEntryFraction: 0.972, pitExitFraction: 0.033, garageCenterRatio: 0.48, canopyDepthMeters: 1.5 }),
  hungaroring: pitLayout({ laneWidthMeters: 12, garageDepthMeters: 12.5, buildingHeightMeters: 16, pitOffsetMeters: 8.3, pitEntryFraction: 0.963, pitExitFraction: 0.035, garageCenterRatio: 0.49, canopyDepthMeters: 2.2 }),
  zandvoort: pitLayout({ laneWidthMeters: 9, garageDepthMeters: 8, buildingHeightMeters: 9, pitOffsetMeters: 6.4, pitEntryFraction: 0.952, pitExitFraction: 0.039, garageCenterRatio: 0.5, garageStartRatio: 0.24, garageEndRatio: 0.76, pitBoxLengthMeters: 6.5, pitBoxDepthMeters: 2.2, canopyDepthMeters: 1.2 }),
  monza: pitLayout({ laneWidthMeters: 13, garageDepthMeters: 12.9, buildingHeightMeters: 9, pitOffsetMeters: 8.8, pitEntryFraction: 0.961, pitExitFraction: 0.034, garageCenterRatio: 0.49, canopyDepthMeters: 1.5 }),
  madrid: pitLayout({ laneWidthMeters: 14, garageDepthMeters: 14, buildingHeightMeters: 18.5, pitOffsetMeters: 9.3, pitEntryFraction: 0.94, pitExitFraction: 0.05, garageCenterRatio: 0.5, canopyDepthMeters: 2.5 }),
  baku: pitLayout({ laneWidthMeters: 10, garageDepthMeters: 9, buildingHeightMeters: 15, pitOffsetMeters: 7.1, pitEntryFraction: 0.969, pitExitFraction: 0.024, garageCenterRatio: 0.5, canopyDepthMeters: 1.8 }),
  singapore: pitLayout({ laneWidthMeters: 10, garageDepthMeters: 10, buildingHeightMeters: 18, pitOffsetMeters: 7.2, pitEntryFraction: 0.958, pitExitFraction: 0.042, garageCenterRatio: 0.51, canopyDepthMeters: 2.4 }),
  austin: pitLayout({ laneWidthMeters: 12, garageDepthMeters: 11, buildingHeightMeters: 12, pitOffsetMeters: 8.2, pitEntryFraction: 0.959, pitExitFraction: 0.039, garageCenterRatio: 0.5, canopyDepthMeters: 1.8 }),
  'mexico-city': pitLayout({ laneWidthMeters: 12, garageDepthMeters: 10, buildingHeightMeters: 12, pitOffsetMeters: 8.1, pitEntryFraction: 0.951, pitExitFraction: 0.036, garageCenterRatio: 0.5, canopyDepthMeters: 1.6 }),
  interlagos: pitLayout({ laneWidthMeters: 10.5, garageDepthMeters: 9, buildingHeightMeters: 12, pitOffsetMeters: 7.3, pitEntryFraction: 0.919, pitExitFraction: 0.041, garageCenterRatio: 0.53, canopyDepthMeters: 2.8 }),
  'las-vegas': pitLayout({ laneWidthMeters: 13, garageDepthMeters: 13, buildingHeightMeters: 20, pitOffsetMeters: 8.9, pitEntryFraction: 0.957, pitExitFraction: 0.032, garageCenterRatio: 0.51, canopyDepthMeters: 2.4 }),
  lusail: pitLayout({ laneWidthMeters: 14, garageDepthMeters: 13, buildingHeightMeters: 16, pitOffsetMeters: 9.3, pitEntryFraction: 0.963, pitExitFraction: 0.035, garageCenterRatio: 0.5, canopyDepthMeters: 3 }),
  'yas-marina': pitLayout({ laneWidthMeters: 13, garageDepthMeters: 12, buildingHeightMeters: 17, pitOffsetMeters: 8.8, pitEntryFraction: 0.936, pitExitFraction: 0.046, garageCenterRatio: 0.52, canopyDepthMeters: 3 }),
})

const infrastructureReferencesV2 = Object.freeze({
  'albert-park': [
    { label: 'Australian Grand Prix official 2026 visitor map', url: 'https://www.grandprix.com.au/uploads/images/F126_009_Visitor-Map_A3_V9-Digi-3.pdf' },
  ],
  shanghai: [
    { label: 'Shanghai government official circuit venue map', url: 'https://english.shanghai.gov.cn/assets/Download/Shanghai%20International%20Circuit%20Map.pdf' },
  ],
  suzuka: [
    { label: 'Suzuka Circuit official 2026 spectator map', url: 'https://www.suzukacircuit.jp/f1/map/pdf/map.pdf' },
  ],
  monza: [
    {
      label: 'FIA 2025 Monza F3 event notes — Turns 1–2 escape-road block procedure',
      url: 'https://www.fia.com/system/files/decision-document/2025_monza_event_-_f3_monza_event_notes_2025_v2.pdf',
      checkedAt: '2026-08-28',
    },
    {
      label: 'Monza Rettifilo photographic reference — white polystyrene blocks with red chevrons',
      url: 'https://www.gpfans.com/en/f1-news/56682/vettel-lucky-after-surprising-monza-brake-failure/',
      checkedAt: '2026-08-28',
    },
  ],
  bahrain: [
    { label: 'Bahrain International Circuit official grandstand map', url: 'https://www.bahrain.gp/en/map-of-the-grandstands-24' },
  ],
  jeddah: [
    { label: 'Formula 1 official Jeddah pit and team building presentation', url: 'https://www.formula1.com/en/latest/article/revealed-new-images-of-state-of-the-art-saudi-arabian-pit-and-team-building.3XR9bIkbSNnUljmD176uzD' },
  ],
  barcelona: [
    { label: 'Circuit de Barcelona-Catalunya official facilities plan', url: 'https://www.circuitcat.com/wp-content/uploads/2018/01/AAFF_SPACE_LETTING_ENG.pdf' },
  ],
  montreal: [
    { label: 'Canadian Grand Prix official grandstand guide', url: 'https://gpcanada.ca/en/type-de-billet/grandstands/' },
  ],
  silverstone: [
    { label: 'Silverstone official Formula 1 master venue map', url: 'https://www.silverstone.co.uk/sites/default/files/pdf/F1%20Master%20Map%202023.pdf' },
  ],
  singapore: [
    { label: 'Singapore Grand Prix official Super Pit Grandstand page', url: 'https://singaporegp.sg/en/tickets/general-tickets/grandstands/super-pit-grandstand/' },
  ],
  'las-vegas': [
    { label: 'Las Vegas Grand Prix official circuit and venue overview', url: 'https://www.f1lasvegasgp.com/track-layout/' },
  ],
  lusail: [
    { label: 'FIA 2025 Qatar Grand Prix official media guide', url: 'https://www.fia.com/sites/default/files/media_kit_-_2025_qatar_grand_prix_2.pdf' },
  ],
})

const grandPrixGuidesSlugs = Object.freeze({
  'albert-park': 'australia',
  shanghai: 'china',
  suzuka: 'japan',
  bahrain: 'bahrain',
  jeddah: 'saudi-arabia',
  miami: 'miami',
  montreal: 'canada',
  monaco: 'monaco',
  barcelona: 'spain',
  spielberg: 'austria',
  silverstone: 'silverstone',
  'spa-francorchamps': 'belgium',
  hungaroring: 'hungary',
  zandvoort: 'netherlands',
  monza: 'monza',
  madrid: 'madrid',
  baku: 'azerbaijan',
  singapore: 'singapore',
  austin: 'austin',
  'mexico-city': 'mexico',
  interlagos: 'brazil',
  'las-vegas': 'vegas',
  lusail: 'qatar',
  'yas-marina': 'abu-dhabi',
})

export function infrastructureProfileFor(trackId) {
  const resolved = trackInfrastructureProfilesV2[trackId]
  if (!resolved) throw new Error(`${trackId}: missing v2 infrastructure profile`)
  const pitLayoutProfile = pitLayoutsV2[trackId]
  if (!pitLayoutProfile) throw new Error(`${trackId}: missing v2 pit layout profile`)
  const {
    pitOffsetMeters,
    pitEntryFraction,
    pitExitFraction,
    pitGarageCenterRatio,
    ...pitVisualLayout
  } = pitLayoutProfile
  const pit = { ...resolved.pitVisual, ...pitVisualLayout }
  const supplementary = (supplementaryGrandstandsV2[trackId] ?? []).map(
    (object) => structure(
      object.id,
      object.kind,
      object.fraction,
      object.side,
      object.offsetMeters,
      object.scale,
      pit.primaryColor,
      pit.secondaryColor,
      pit.accentColor,
      pit.roofColor,
    ),
  )
  return {
    ...resolved,
    pitOffsetMeters,
    pitEntryFraction,
    pitExitFraction,
    pitGarageCenterRatio,
    pitVisual: pit,
    structures: [...resolved.structures, ...supplementary],
  }
}

export function infrastructureReferencesFor(trackId) {
  const slug = grandPrixGuidesSlugs[trackId]
  if (!slug) throw new Error(`${trackId}: missing Grand Prix Guides slug`)
  return [
    ...(infrastructureReferencesV2[trackId] ?? []),
    {
      label: `Grand Prix Guides satellite overview — ${trackId}`,
      url: `https://grandprixguides.com/circuit/${slug}`,
    },
  ].map((reference) => ({
    ...reference,
    checkedAt: reference.checkedAt ?? '2026-08-27',
  }))
}

export function fenceVisualProfileFor(trackId) {
  const profile = fenceVisualProfilesV2[trackId]
  if (!profile) throw new Error(`${trackId}: missing v2 fence visual profile`)
  return profile
}
