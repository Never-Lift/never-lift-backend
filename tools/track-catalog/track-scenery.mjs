const landmark = (
  id,
  kind,
  fraction,
  side,
  offsetMeters,
  scale,
  rotationOffset = 0,
) => ({ id, kind, fraction, side, offsetMeters, scale, rotationOffset })

// These are deliberately authored per circuit. Fractions anchor each object to
// the metric centerline while side/offset keep it attached to the same section
// when the source geometry is regenerated. They are gameplay landmarks, not a
// survey-grade reconstruction of buildings or vegetation.
export const trackSceneryProfiles = {
  'albert-park': {
    landmarks: [
      landmark('albert-lake', 'lake', 0.18, 'left', 58, 22, -0.2),
      landmark('melbourne-skyline', 'city-skyline', 0.48, 'right', 68, 16, 0.15),
      landmark('albert-park-trees', 'park-trees', 0.73, 'left', 32, 6, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'left', 38, 12)],
  },
  shanghai: {
    landmarks: [
      landmark('lotus-grandstand', 'lotus-grandstand', 0.04, 'left', 48, 14, 0.08),
      landmark('shanghai-circuit-tower', 'circuit-tower', 0.37, 'right', 58, 9, -0.2),
      landmark('shanghai-lake', 'lake', 0.68, 'left', 62, 20, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.97, 'left', 42, 13)],
  },
  suzuka: {
    landmarks: [
      landmark('suzuka-ferris-wheel', 'ferris-wheel', 0.72, 'right', 55, 12),
      landmark('suzuka-overpass', 'track-overpass', 0.48, 'left', 22, 9, Math.PI / 2),
      landmark('suzuka-forest', 'forest', 0.2, 'right', 38, 9, 0.2),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.965, 'left', 40, 12)],
  },
  bahrain: {
    landmarks: [
      landmark('bahrain-desert-tower', 'desert-tower', 0.06, 'left', 60, 10, 0.1),
      landmark('bahrain-floodlights', 'floodlight-array', 0.44, 'right', 28, 6),
      landmark('sakhir-desert', 'desert-expanse', 0.7, 'left', 68, 28, -0.15),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'left', 44, 14)],
  },
  jeddah: {
    landmarks: [
      landmark('jeddah-waterfront', 'waterfront', 0.22, 'left', 60, 25),
      landmark('jeddah-towers', 'waterfront-towers', 0.52, 'right', 66, 14, 0.1),
      landmark('jeddah-marina', 'marina', 0.79, 'left', 62, 18, -0.2),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'right', 34, 11)],
  },
  miami: {
    landmarks: [
      landmark('hard-rock-stadium', 'stadium', 0.12, 'left', 58, 20, 0.1),
      landmark('miami-marina', 'marina', 0.47, 'right', 54, 14, -0.15),
      landmark('miami-palms', 'palm-grove', 0.76, 'left', 34, 6, 0.2),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.97, 'right', 40, 12)],
  },
  montreal: {
    landmarks: [
      landmark('saint-lawrence-river', 'river', 0.18, 'right', 64, 25, -0.1),
      landmark('notre-dame-island', 'island-trees', 0.49, 'left', 36, 8, 0.15),
      landmark('montreal-casino', 'casino-building', 0.8, 'right', 56, 12, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'left', 38, 11)],
  },
  monaco: {
    landmarks: [
      landmark('monaco-marina', 'marina', 0.16, 'left', 50, 16, -0.1),
      landmark('monaco-yachts', 'yachts', 0.39, 'left', 44, 8, 0.2),
      landmark('monaco-tunnel-building', 'tunnel-building', 0.62, 'right', 18, 14),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.96, 'left', 24, 10)],
  },
  barcelona: {
    landmarks: [
      landmark('barcelona-main-tower', 'circuit-tower', 0.09, 'right', 54, 9, 0.1),
      landmark('barcelona-grandstand', 'grandstand', 0.43, 'left', 44, 13, -0.1),
      landmark('catalonia-hills', 'wooded-hills', 0.72, 'right', 68, 24, 0.2),
    ],
    staticObjects: [landmark('pit-building', 'pit-building', 0.98, 'right', 24, 14)],
  },
  spielberg: {
    landmarks: [
      landmark('styrian-alps', 'alpine-hills', 0.16, 'right', 70, 30, -0.1),
      landmark('spielberg-bull-sculpture', 'bull-sculpture', 0.52, 'left', 50, 8, 0.15),
      landmark('spielberg-hill-grandstand', 'hill-grandstand', 0.77, 'right', 54, 14),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'left', 42, 12)],
  },
  silverstone: {
    landmarks: [
      landmark('silverstone-wing', 'wing-building', 0.05, 'right', 42, 16, 0.05),
      landmark('silverstone-hangar', 'aircraft-hangar', 0.4, 'left', 60, 14, -0.1),
      landmark('silverstone-infield', 'open-infield', 0.7, 'right', 68, 30, 0.15),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.965, 'left', 45, 13)],
  },
  'spa-francorchamps': {
    landmarks: [
      landmark('ardenne-forest', 'forest', 0.19, 'right', 42, 10, 0.1),
      landmark('spa-chalet', 'chalet', 0.48, 'left', 48, 8, -0.15),
      landmark('raidillon-grandstand', 'hill-grandstand', 0.83, 'right', 52, 14),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'left', 38, 12)],
  },
  hungaroring: {
    landmarks: [
      landmark('hungaroring-wooded-hills', 'wooded-hills', 0.2, 'right', 68, 25, 0.15),
      landmark('hungaroring-tower', 'circuit-tower', 0.5, 'left', 54, 9, -0.1),
      landmark('hungaroring-infield', 'open-infield', 0.75, 'right', 66, 28, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.97, 'left', 40, 12)],
  },
  zandvoort: {
    landmarks: [
      landmark('zandvoort-dunes', 'sand-dunes', 0.2, 'right', 48, 20, 0.12),
      landmark('north-sea', 'sea', 0.52, 'left', 70, 30, -0.1),
      landmark('zandvoort-grandstand', 'grandstand', 0.78, 'right', 42, 13),
    ],
    staticObjects: [landmark('pit-building', 'pit-building', 0.98, 'right', 23, 13)],
  },
  monza: {
    landmarks: [
      landmark('monza-forest', 'forest', 0.18, 'left', 38, 10, 0.1),
      landmark('historic-banking', 'historic-banking', 0.52, 'right', 58, 16, -0.2),
      landmark('monza-pit-tower', 'pit-tower', 0.79, 'left', 46, 9, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'right', 40, 12)],
  },
  madrid: {
    landmarks: [
      landmark('ifema-exhibition-hall', 'exhibition-hall', 0.16, 'right', 58, 18, 0.08),
      landmark('madrid-city-block', 'city-block', 0.47, 'left', 54, 14, -0.1),
      landmark('valdebebas-park', 'urban-park', 0.76, 'right', 52, 10, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.97, 'left', 38, 12)],
  },
  baku: {
    landmarks: [
      landmark('baku-old-city-wall', 'old-city-wall', 0.21, 'left', 20, 18, 0.05),
      landmark('flame-towers', 'city-towers', 0.5, 'right', 68, 16, -0.1),
      landmark('baku-waterfront', 'waterfront', 0.78, 'left', 60, 25, 0.15),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'right', 28, 11)],
  },
  singapore: {
    landmarks: [
      landmark('marina-bay-sands', 'triple-tower-hotel', 0.15, 'right', 64, 18, 0.1),
      landmark('singapore-flyer', 'ferris-wheel', 0.46, 'left', 58, 12, -0.1),
      landmark('marina-bay-waterfront', 'waterfront', 0.75, 'right', 62, 24, 0.15),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.97, 'left', 30, 11)],
  },
  austin: {
    landmarks: [
      landmark('cota-observation-tower', 'observation-tower', 0.18, 'right', 56, 12, 0.1),
      landmark('cota-amphitheater', 'amphitheater', 0.49, 'left', 58, 16, -0.15),
      landmark('texas-hills', 'dry-hills', 0.77, 'right', 68, 24, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'left', 42, 12)],
  },
  'mexico-city': {
    landmarks: [
      landmark('foro-sol-stadium', 'stadium-grandstand', 0.24, 'left', 36, 20, 0.1),
      landmark('mexico-color-grandstand', 'color-grandstand', 0.52, 'right', 42, 14, -0.1),
      landmark('mexico-city-skyline', 'city-skyline', 0.78, 'left', 68, 16, 0.15),
    ],
    staticObjects: [landmark('pit-building', 'pit-building', 0.98, 'right', 23, 14)],
  },
  interlagos: {
    landmarks: [
      landmark('interlagos-hillside-stands', 'hillside-grandstand', 0.18, 'right', 50, 14, 0.1),
      landmark('sao-paulo-skyline', 'city-skyline', 0.5, 'right', 68, 16, -0.1),
      landmark('interlagos-pit-complex', 'pit-building', 0.8, 'right', 42, 15, 0.15),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'left', 38, 12)],
  },
  'las-vegas': {
    landmarks: [
      landmark('las-vegas-sphere', 'sphere', 0.17, 'right', 62, 16, 0.1),
      landmark('strip-neon-towers', 'neon-towers', 0.5, 'left', 64, 16, -0.15),
      landmark('las-vegas-resort', 'resort-building', 0.78, 'right', 58, 16, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.97, 'left', 30, 11)],
  },
  lusail: {
    landmarks: [
      landmark('lusail-floodlights', 'floodlight-array', 0.2, 'left', 30, 6),
      landmark('lusail-pit-building', 'pit-building', 0.48, 'right', 48, 15, -0.1),
      landmark('lusail-desert', 'desert-expanse', 0.75, 'left', 68, 30, 0.15),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.975, 'right', 42, 12)],
  },
  'yas-marina': {
    landmarks: [
      landmark('yas-hotel-bridge', 'hotel-bridge', 0.18, 'left', 40, 16, 0.1),
      landmark('yas-marina', 'marina', 0.5, 'right', 58, 18, -0.15),
      landmark('yas-yachts', 'yachts', 0.76, 'right', 52, 8, 0.1),
    ],
    staticObjects: [landmark('main-grandstand', 'grandstand', 0.97, 'left', 42, 12)],
  },
}
