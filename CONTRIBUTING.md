# Contributing

Contributions are under the [MIT License](LICENSE). Follow
[GitHub's Contributor Code of Conduct](https://github.com/github/.github/blob/main/CODE_OF_CONDUCT.md).
Search existing issues before proposing substantial work. Report security
issues privately using [SECURITY.md](SECURITY.md), not the public issue tracker.

Use Node 24 and the exact Corepack-managed pnpm version in `package.json`.
This is one package and one lockfile, not a copy of the product monorepo.

```sh
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm build
pnpm check
```

`pnpm check` runs type checking, lint, model-free coverage, deterministic
source-to-bundle comparison, and a clean consumer-directory packaging control.
The packaged control deliberately lacks artifact-service credentials and
verifies explicit failure, not native execution. Linux CI separately exercises
the packaged Action under the hosted artifact service. Neither is native runtime
qualification. No model credentials belong in CI or test fixtures.

Commit `dist/index.cjs` and its generated license notices. This is an intentional
JavaScript Action distribution exception: consumers execute committed `dist`
without installing this repository. `pnpm check:dist` compares build bytes with
the checked-in bundle. Never hand-edit generated files. Update the source,
rebuild, and review both source and distribution changes.

Use strict TypeScript, argument-array process invocation, exact dependencies,
and SHA-pinned third-party Actions. Do not log raw evaluator/process output or
copy native runtime behavior into the Action. New native capabilities require
the canonical headless runtime contract and model-free integration controls.
Only trusted own-repository code may eventually receive execution credentials;
environment filtering is not an OS sandbox.

## Release preparation

This draft is not release-ready. Before proposing a release, integrate an
immutable closed Runtime/Core bundle and record its actual version/checksum,
verify supported selected-engine identities and native Linux model-free
acceptance, wire native verdict/evidence handling, and finish serialized
reporting and tool reuse. Include the runtime's notices in the distribution.
Run `pnpm check` from a clean checkout, review dependency provenance and the
packaged delta, and document support and limitations.

Publishing, version tags, Marketplace listing, visibility/access changes, live
model validation, and credential enablement each require separate authorization.
Do not publish or claim customer availability solely because packaging CI passes.
