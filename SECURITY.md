# Security

## Reporting a vulnerability

Send suspected vulnerabilities to
[opensource-security@github.com](mailto:opensource-security@github.com),
GitHub's reporting contact for open-source repositories. Repository collaborator
access is not required. Do not disclose vulnerabilities in public issues,
discussions, pull requests or release comments.

Include the affected Action commit, engine/runtime versions if applicable,
environment, relevant files, minimal non-destructive reproduction and impact.
Remove tokens, credentials, private project data and model traces.
Coordinate public disclosure with the security team and maintainers.

This project follows
[GitHub's open-source security policy](https://github.com/github/.github/blob/main/SECURITY.md).
Consult the current [bug bounty scope](https://bounty.github.com/scope) and
[Safe Harbor policy](https://docs.github.com/en/site-policy/security-policies/github-bug-bounty-program-legal-safe-harbor).
This repository does not promise bounty rewards, response deadlines or a
separate long-term support schedule.

## Execution boundary

The development preview fails closed before native execution. Future execution
must bind authority to a reviewed workflow, immutable checkout, selected engine
and current native plan. Fork model execution and `pull_request_target` are not
supported. Do not provide model credentials to untrusted code. Environment
filtering does not isolate processes running as the same runner user.
