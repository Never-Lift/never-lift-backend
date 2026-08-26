// Track-side infrastructure is deliberately separate from the historical v1
// scenery profiles. The side is expressed from the driver's direction on the
// start/finish straight and was audited against FIA circuit and pit-lane maps.
// Entry/exit fractions remain data so a later functional pit-stop pass can
// refine the paths without changing the track schema.
const defaultProfile = Object.freeze({
  pitSide: 'right',
  pitEntryFraction: 0.91,
  pitExitFraction: 0.09,
  pitOffsetMeters: 5.5,
})

export const trackInfrastructureProfilesV2 = Object.freeze({
  'albert-park': defaultProfile,
  shanghai: defaultProfile,
  suzuka: defaultProfile,
  bahrain: defaultProfile,
  jeddah: { ...defaultProfile, pitSide: 'left' },
  miami: defaultProfile,
  montreal: defaultProfile,
  monaco: {
    ...defaultProfile,
    // The source geometry starts near Beau Rivage. Rebase the executable v2
    // lap to Boulevard Albert 1er, beside the real start/finish and pit lane.
    startOffsetMeters: 2429.5,
    pitEntryFraction: 0.9,
    pitExitFraction: 0.085,
    pitOffsetMeters: 4.6,
  },
  barcelona: defaultProfile,
  spielberg: defaultProfile,
  silverstone: defaultProfile,
  'spa-francorchamps': defaultProfile,
  hungaroring: defaultProfile,
  zandvoort: defaultProfile,
  monza: defaultProfile,
  madrid: defaultProfile,
  baku: { ...defaultProfile, pitSide: 'left' },
  singapore: defaultProfile,
  austin: defaultProfile,
  'mexico-city': defaultProfile,
  interlagos: { ...defaultProfile, pitSide: 'left' },
  'las-vegas': { ...defaultProfile, pitSide: 'left' },
  lusail: defaultProfile,
  'yas-marina': defaultProfile,
})

export function infrastructureProfileFor(trackId) {
  const profile = trackInfrastructureProfilesV2[trackId]
  if (!profile) throw new Error(`${trackId}: missing v2 infrastructure profile`)
  return profile
}
