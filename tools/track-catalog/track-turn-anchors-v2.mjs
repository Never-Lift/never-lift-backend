// Numbered corner anchors are fixed against the final metric centerline. For
// 23 venues they were projected from the numbered satellite markers published
// by Grand Prix Guides on 2026-08-27, then cross-checked against the official
// FIA/circuit references attached to each TrackDefinition. Madrid has no
// verifiable as-built satellite layer yet, so its anchors follow the latest
// official project geometry and remain explicitly provisional.
export const trackTurnAnchorsV2 = Object.freeze({
  'albert-park': [300, 420, 1033, 1175, 1402, 1824, 1907, 2152, 3276, 3366, 4063, 4333, 4578, 4729],
  shanghai: [185, 305, 476, 609, 914, 1168, 1606, 1941, 2121, 2247, 2731, 2838, 2993, 4382, 4455, 4755],
  suzuka: [386, 571, 802, 949, 1101, 1259, 1465, 2008, 2167, 2461, 2635, 3124, 3511, 3684, 4677, 5105, 5160, 5312],
  bahrain: [455, 556, 673, 1254, 1527, 1617, 1739, 2001, 2361, 2464, 3223, 3541, 3845, 4657, 4737],
  jeddah: [297, 342, 494, 810, 921, 1053, 1197, 1258, 1409, 1520, 1614, 1676, 2254, 2600, 2780, 2902, 2982, 3157, 3365, 3593, 3848, 4105, 4168, 4328, 4596, 5154, 5378],
  miami: [171, 277, 354, 921, 1070, 1229, 1414, 1479, 1996, 2261, 2916, 3041, 3168, 3248, 3273, 3368, 4697, 4847, 5038],
  montreal: [423, 531, 896, 957, 1164, 1415, 1511, 2182, 2228, 2866, 2983, 3328, 4073, 4102],
  monaco: [223, 508, 744, 908, 1140, 1272, 1360, 1445, 1890, 2108, 2136, 2387, 2539, 2584, 2715, 2734, 2833, 2939, 3026],
  barcelona: [629, 723, 981, 1519, 1911, 2146, 2354, 2424, 2711, 3290, 3429, 3592, 3892, 4149],
  spielberg: [300, 841, 1244, 2054, 2251, 2578, 2883, 3069, 3637, 3851],
  silverstone: [3561, 3761, 4029, 4185, 4398, 5112, 5362, 5651, 325, 873, 967, 1127, 1262, 1440, 2291, 2783, 2851, 3026],
  'spa-francorchamps': [170, 836, 926, 1056, 2210, 2281, 2438, 2850, 3086, 3623, 3843, 4305, 4452, 4742, 4950, 5663, 5975, 6534, 6594],
  hungaroring: [267, 778, 974, 1447, 1698, 2033, 2069, 2236, 2379, 2582, 2769, 3184, 3447, 3738],
  zandvoort: [349, 672, 813, 1043, 1241, 1406, 1671, 2005, 2235, 2497, 3074, 3161, 3478, 3777],
  monza: [473, 511, 913, 1688, 1731, 2091, 2423, 3494, 3569, 3679, 4703],
  madrid: [130, 190, 340, 1240, 1320, 1630, 1690, 1800, 1970, 2070, 2290, 2350, 2450, 3030, 3220, 3670, 3730, 3970, 4200, 4530, 4680, 4990],
  baku: [135, 475, 1350, 1578, 1917, 1972, 2361, 2564, 2582, 2606, 2663, 2724, 3141, 3335, 3580, 3928, 4119, 4362, 4514, 4888],
  singapore: [368, 436, 525, 653, 903, 1371, 1738, 1974, 2161, 2603, 2730, 2813, 3010, 3547, 3779, 4288, 4371, 4643, 4743],
  austin: [261, 460, 792, 870, 970, 1129, 1335, 1526, 1595, 1804, 2200, 3399, 3625, 3727, 3914, 4140, 4230, 4392, 4670, 4974],
  'mexico-city': [1035, 1121, 1170, 1867, 1950, 2104, 2436, 2542, 2630, 2821, 2917, 3481, 3664, 3714, 3766, 3844, 3941],
  interlagos: [250, 332, 533, 1305, 1502, 1937, 2057, 2226, 2366, 2644, 2902, 3155, 3291, 3585, 3883],
  'las-vegas': [101, 150, 335, 536, 1397, 1701, 1866, 1922, 2057, 2510, 2840, 3043, 3719, 4999, 5043, 5112, 5800],
  lusail: [417, 725, 955, 1359, 1543, 1830, 2246, 2431, 2565, 2790, 2993, 3418, 3615, 3824, 4149, 4619],
  'yas-marina': [196, 439, 625, 804, 1242, 2449, 2522, 2736, 3533, 3896, 4029, 4162, 4276, 4392, 4680, 4894],
})

export function turnAnchorsFor(trackId, expectedCount, lengthMeters) {
  const anchors = trackTurnAnchorsV2[trackId]
  if (!anchors) throw new Error(`${trackId}: missing numbered turn anchors`)
  if (anchors.length !== expectedCount) {
    throw new Error(
      `${trackId}: ${anchors.length}/${expectedCount} numbered turn anchors`,
    )
  }
  if (
    anchors.some(
      (distanceMeters) =>
        !Number.isFinite(distanceMeters) ||
        distanceMeters < 0 ||
        distanceMeters >= lengthMeters,
    )
  ) {
    throw new Error(`${trackId}: numbered turn anchor outside track bounds`)
  }
  return anchors
}
