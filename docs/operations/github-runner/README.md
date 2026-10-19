---
file: docs/operations/github-runner/README.md
description: Self-hosted Linux CI routing, isolation and branch inheritance.
created_at: 2026-09-14 14:10:00 Asia/Shanghai
updated_at: 2026-10-19 15:00:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: .github/workflows, GitHub runner registration, live arc-systems/docmost-runner
applies_to: [operations, ci]
disclaimer: This document is for reference and may change. Current code and live configuration take precedence.
---

# GitHub Actions Runner

Linux jobs use `docmost-linux-checks`. The live deployment verified on 2026-10-19
is `arc-systems/docmost-runner` on `xenzify-dev`, scoped to this repository with
`ephemeral: true`. Runner names are `docmost-runner-*`, not the retired
`superchat-dev-docmost-01` systemd runner. Xcode/iOS keeps explicit macOS routing.

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

The current ARC pods run jobs as UID 1001 with a separate Docker sidecar.
The socket and work directory are per-pod emptyDir volumes; the inspected pod has
no hostPath volumes and does not mount the business host Docker socket. The Docker
sidecar is privileged, so this is pod-scoped Docker isolation, **not rootless Docker**
or proof of a hostile-code security sandbox. Same-repository trust restrictions remain.
The workflow verifies a non-root job, self-hosted environment, expected ephemeral
runner name/hostname, matching Docker daemon name, build/run and ARM64 emulation.

This update reconciles stale host-runner checks with the existing ARC architecture;
it does not change cluster privileges, capacity, runner image, or host services.
The older fleet provisioning files in DriveAcademy are historical and must not be
used to restart an obsolete systemd service. Recheck live pod volumes and repository
scope when the ARC topology changes; labels alone do not prove isolation.
