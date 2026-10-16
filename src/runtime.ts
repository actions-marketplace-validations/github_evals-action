export const runtimeBlocker =
  'Canonical headless Runtime/Core bundle is not integrated. This development preview cannot lint, resolve plans, or execute evaluations. No evaluator was started.';

// Do not invent exports or replace native resolution with declaration inspection.
// Replace this gate only with a pinned, checksum-verified canonical bundle and native contract tests.
export function requireRuntime(): never {
  throw new Error(runtimeBlocker);
}
