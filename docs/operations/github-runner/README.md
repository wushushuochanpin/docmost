---
file: docs/operations/github-runner/README.md
description: Self-hosted Linux CI routing, isolation and branch inheritance.
created_at: 2026-09-14 14:10:00 Asia/Shanghai
updated_at: 2026-09-14 14:10:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: .github/workflows, GitHub repository runner registration, superchat-dev systemd services
applies_to: [operations, ci]
disclaimer: This document is for reference and may change. Current code and live configuration take precedence.
---

# GitHub Actions Runner

Linux jobs use `docmost-linux-checks`, registered to this repository as
`superchat-dev-docmost-01` on `superchat-dev` (43.134.45.185).
Xcode / iOS Simulator jobs keep their explicit macOS labels.

The workflow files travel with Git. Pull the current main branch at home or on a new
computer; no local hook, runner installation or registration is needed. New branches
inherit these files. Existing branches must merge the current main before pushing;
a local branch that retains older workflows can still select hosted runners.
`scripts/check-ci-runner-policy.py` and the Runner policy workflow detect route drift.
This is a maintenance guard, not an adversarial YAML policy engine.

Only same-repository pull requests may execute on persistent runners. Fork pull
requests are skipped; there is no paid Linux fallback if this runner is offline.
Workflows retain their release/manual triggers. Changing runner routing does not
publish images or deploy the application by itself.

Each repository has a separate unprivileged Linux account, a private home directory,
and (where required) a private rootless Docker daemon. Jobs cannot access the host
production Docker socket. Test containers bind published ports to loopback and use
ports distinct from the business databases. All newly added project runners share
one build capacity slot and a systemd slice capped at 2 CPUs / 5 GiB memory / 1 GiB
swap. Jobs wait for that slot; workflow duration includes capacity waits. Below
10 GiB free disk, new work fails closed. Cleanup removes only this CI account's
build outputs, temporary credentials and Docker artifacts.

Server owner: `/opt/project-actions`. Provisioning source is maintained in
DriveAcademy `config/github-runner/fleet/`. Runner accounts use `ci-docmost`;
the user service is `actions-runner.service`. Registration uses short-lived GitHub
registration tokens passed on stdin; never store a PAT in the repository or service.
To pause CI, stop this user service; do not switch routes back to paid Linux runners.
Mac execution and GitHub artifact/cache storage may still incur charges.
