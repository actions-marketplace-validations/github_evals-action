# Contributor instructions

- Keep this a thin GitHub adapter; native selection, execution and evidence
  belong to the canonical Runtime/Core bundle, never a parallel runner.
- Use Node 24, the pinned pnpm version, and one lockfile. Install with scripts
  disabled. Run focused tests during development and `pnpm check` before review.
- Rebuild and commit `dist` after source changes. Never manually edit bundles.
- Do not run models, add credentials, publish, merge or change repository
  visibility without separate authorization.
- Preserve unknown counts and not-run outcomes. Never infer pass from process
  completion or use a report-only override for native failures.
- Treat prompts, source, raw evidence and credentials as private. Default
  artifacts are allowlisted structured projections only.
- Use argument-array process calls and SHA-pinned third-party Actions.
- Keep the PR draft while actual native integration or Linux acceptance is missing.
