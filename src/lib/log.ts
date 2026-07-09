/** Dev-gated diagnostics: ids/counts/reason-codes only — never note bodies,
 *  never the address book. Silent in production builds. */
export function diag(tag: string, detail?: Record<string, unknown> | string | number): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[cym:${tag}]`, detail ?? '');
  }
}
