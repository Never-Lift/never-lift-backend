const pitVisual = (
  architecture,
  primaryColor,
  secondaryColor,
  accentColor,
  roofColor,
  garageCount = 10,
  buildingHeightMeters = 4.2,
) => ({
  architecture,
  primaryColor,
  secondaryColor,
  accentColor,
  roofColor,
  garageCount,
  buildingHeightMeters,
})

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
) => ({
  id,
  kind,
  fraction,
  side,
  offsetMeters,
  scale,
  rotationOffset,
  visualStyle: { primaryColor, secondaryColor, accentColor, roofColor },
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
      structure('lotus-grandstand', 'grandstand-covered', 0.04, 'left', 48, 17, '#a41f2a', '#d8dadd', '#b79a4a', '#e9eaec'),
      structure('paddock-pavilion', 'paddock-building', 0.01, 'right', 30, 13, '#d7d9dc', '#444d57', '#b51e2a', '#eef0f2'),
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
      structure('pit-building', 'race-control-building', 0.99, 'right', 24, 10, '#d9dbd9', '#4f565d', '#a34d21', '#eceeec'),
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
      structure('turn-one-grandstand', 'grandstand-hillside', 0.06, 'left', 52, 15, '#d2d6d7', '#505a63', '#8f2933', '#eaeced'),
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
      structure('lusail-pit-building', 'race-control-building', 0.99, 'right', 25, 12, '#e2e0da', '#505a62', '#315f83', '#f0eee8'),
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
    supplementalGrandstand('turn-one-grandstand', 0.13, 'right', 48, 15, 'grandstand-covered'),
    supplementalGrandstand('hairpin-grandstand', 0.82, 'left', 46, 13),
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
    supplementalGrandstand('turn-one-grandstand', 0.05, 'right', 37, 13, 'grandstand-covered'),
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
    supplementalGrandstand('final-sector-grandstand', 0.79, 'left', 46, 13),
  ],
  zandvoort: [
    supplementalGrandstand('arena-grandstand', 0.48, 'left', 44, 15, 'grandstand-covered'),
    supplementalGrandstand('eastside-grandstand', 0.67, 'right', 43, 13),
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
    supplementalGrandstand('turn-fifteen-grandstand', 0.71, 'left', 47, 14, 'grandstand-covered'),
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

export function infrastructureProfileFor(trackId) {
  const resolved = trackInfrastructureProfilesV2[trackId]
  if (!resolved) throw new Error(`${trackId}: missing v2 infrastructure profile`)
  const pit = resolved.pitVisual
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
    structures: [...resolved.structures, ...supplementary],
  }
}

export function infrastructureReferencesFor(trackId) {
  return infrastructureReferencesV2[trackId] ?? []
}
