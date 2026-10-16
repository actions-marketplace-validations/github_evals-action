# Evals Action

**Development preview: native integration is blocked. Do not deploy this Action
as an evaluation gate yet.** There is no released version or Marketplace listing.
Repository access is also required while this repository is private.

This repository is building a thin Node 24 GitHub Action for native Vally
`lint`, `plan`, and `run` operations on **Linux x64 GitHub-hosted runners**.
It does not implement an evaluation runner or parse native project configuration.

## What works in this draft

The packaged Action validates explicit inputs and checkout identity, excludes
fork pull requests, writes a minimal structured report and job summary, and
uploads that report using the Actions artifact service. Invalid inputs fail.
Eligible operations fail with `headless-runtime-unavailable` before installing
an engine or starting an evaluator. Forks report **not-run**, not passed.
Unknown counts are absent, not zero.

Independent tested modules provide exact/latest-stable engine metadata
resolution, script-suppressed isolated installation and identity checks, matrix
rendering, privacy-safe report projection, and owned-comment ordering decisions.
The installer, matrix and comment policies are **not wired to native execution**.
Synthetic tests of these modules are not native Vally qualification.

## Required integration before release

The canonical `github/evals` Runtime is currently a private workspace package,
not an npm-installable headless product. This draft needs an immutable, versioned,
checksum-verified closed Runtime/Core bundle with actual supported exports for
inert plan resolution, native lint, authorized preparation/execution, and
canonical evidence validation. Its engine identity must be explicit and separate
from the Runtime bundle identity.

Until that artifact is delivered and tested, this Action deliberately cannot
claim native suite validation, empty native selection handling, native
`--require-pass` verdicts, execution authorization/freshness checks, cancellation
evidence retention, prerequisite executor provisioning, or transcript upload.
Sticky comment networking also remains blocked on a serialized reporting
integration; ordering metadata alone is not an atomic concurrent update.

Release acceptance requires model-free **real native** Linux controls for
lint/plan/run, native fail verdicts even with successful process completion,
malformed/missing evidence, valid empty selections versus missing suites,
dynamic unresolved plans, source drift, cancellation, and engine compatibility.
Passing this draft's CI does not satisfy those acceptance gates.

## Input contract

| Input | Meaning |
| --- | --- |
| `command` | Required: `lint`, `plan`, or `run`. Never inferred from a step name. |
| `working-directory` | Required project path relative to the checkout; resolved path must remain inside it. Use `.` for its root. |
| `suite` | Native named suite. |
| `eval-paths` | Newline-separated paths or patterns; spaces are preserved. |
| `tags` | Newline-separated native tag selectors. |
| `vally-version` | `latest` (default) or an exact stable version such as `0.19.0`. |
| `model` | Explicit native model override. |
| `runs`, `workers`, `timeout` | Positive integer native overrides; timeout is in seconds. |
| `max-retries` | Nonnegative integer override, including explicit zero. |
| `comment` | Default `false`. Currently emits an unavailable warning if requested. |
| `report-id` | Stable unique identity within the job, including matrix axes; default `evals`. Letters, digits, `_`, `-`; 1-64 characters. |
| `upload-transcripts` | Default `false`. Currently emits an unavailable warning if requested. |
| `artifact-retention-days` | 1-90, default 7; subject to repository retention policy. |

At least one of `suite`, `eval-paths`, or `tags` is required. Native combination
semantics belong to the canonical runtime; the Action does not invent a union,
intersection, or "run everything" default. Omitted overrides preserve native
configuration and must retain provenance in the eventual resolved plan.

Outputs: `outcome`, `plan-completeness`, `executed`, `passed`, `failed`,
`vally-version`, `result-path`, and `artifact-id`. Counts and engine version are
emitted only when known. In this draft, outcomes are only `error` or `not-run`;
plan completeness is `unknown`. A successful plan is not an evaluation pass.

## Consumer workflow shape (not a working release)

After release qualification, pin `uses: github/evals-action@<reviewed commit SHA>`
to an actual reviewed Action commit. No placeholder release tag is available.
The following is a **design example**, not an install-ready workflow:

```yaml
name: Evaluation plan
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  plan:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      # Add a qualified, immutable Evals Action commit after integration:
      # - uses: github/evals-action@<reviewed commit SHA>
      #   with:
      #     command: plan
      #     working-directory: .
      #     suite: regression
      #     vally-version: latest
```

Only configure triggers your team explicitly selects. Same-repository origin
alone is not authorization to execute arbitrary code. Review the workflow,
selected revision and native configuration, and optionally require a protected
GitHub environment. Never use `pull_request_target` or privileged checkout of
fork code. This draft excludes fork PRs from all operations, before installation.

## Credentials and data

Do not supply model credentials to this blocked preview, lint, plan, or fork
jobs. The future Copilot execution path uses a customer-managed supported token
referenced from a repository/environment secret as `COPILOT_GITHUB_TOKEN`.
GitHub's automatic Actions token is **not** assumed to grant model access.
Fine-grained personal tokens need the Copilot Requests account permission;
OAuth and GitHub App user-to-server tokens may be supported by the selected
engine. Classic PATs are not supported. Hosted compatibility is not qualified
in this draft; consult the
[official CLI authentication guidance](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli).

Reporting credentials must remain separate from evaluator subprocesses. There
is currently **no PR token input or network comment implementation**. Artifact
upload uses the runner's artifact-service credentials, not model credentials.
The future optional comment integration must use least-privilege PR-write
authorization, update only its authenticated author's exact report identity,
serialize concurrent writers, and prevent older run/attempt replacement.
Comment failure must warn without changing the native verdict.

Default report JSON contains only operation status, categories, revision,
identities and known counts. It is a reporting projection, not canonical saved
evidence. No raw runner JSON, prompts, tool output, source code, paths, or
exception text is uploaded. Detailed transcripts will require explicit opt-in;
they may contain secrets or proprietary material, and perfect redaction cannot
be guaranteed. Hard cancellation can prevent reporting and uploads.

Valid **native** empty selection will eventually warn and return not-run without
failing. This deliberately nonblocking result can satisfy branch protection;
it must never be represented as an evaluation pass. Missing suites and genuine
native failures must fail. There is no report-only failure override.

## Tool acquisition design

The acquisition module resolves the npm `latest` stable identity once per
private job directory and keeps exact version pins separate. It installs an
exact Vally package with its coherent dependency graph outside the customer
project, disables lifecycle scripts, and supplies empty user/global npm config.
Registry SHA-512 identity must match the installed lockfile; package layout and
the full dependency-tree hash are checked. A changed cache fails verification
instead of downgrading. Registry integrity is **not publisher attestation**.

The entry point does not yet call this module. Job-level installed-tool reuse,
executor prerequisites, provenance qualification and wiring engine identities
into the canonical runtime remain release gates. Do not cache project results,
secrets, home directories, or model configuration. No customer manifest is
modified, no custom project dependencies are implicitly installed, and no
product repository is cloned or built in a customer job.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and distribution checks,
and [SECURITY.md](SECURITY.md) for private vulnerability reporting.
