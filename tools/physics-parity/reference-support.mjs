/** Node 24 is the canonical generator; runtime portability is tested separately. */
export function requireReferenceRuntime(version = process.versions.node) {
  if (Number(version.split('.')[0]) !== 24) {
    throw new Error(
      `Physics reference verification requires Node 24.x; found ${version}. ` +
      'Do not regenerate the reference with another runtime to hide a mismatch.',
    )
  }
}

/** Git may check out text with CRLF on Windows; no numeric data is normalized. */
export function normalizeReferenceText(value) {
  return value.replaceAll('\r\n', '\n')
}

export function assertReferenceMatches(stored, generated, label) {
  if (normalizeReferenceText(stored) !== normalizeReferenceText(generated)) {
    throw new Error(`${label} is stale; inspect the data/source difference before regenerating`)
  }
}
