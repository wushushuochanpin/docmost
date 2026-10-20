#!/usr/bin/env python3
"""Fail closed when production deployment drifts back to host-side builds."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github/workflows/deploy.yml").read_text()
RUNTIME = (ROOT / "deploy/k8s/production/runtime.yaml").read_text()

required_workflow = [
    "docker/build-push-action@v6",
    "push: true",
    "IMAGE_DIGEST: ${{ steps.image.outputs.digest }}",
    "kubectl apply --dry-run=server",
    "kubectl -n docmost rollout status",
    "previous_image=",
]
required_runtime = [
    "image: __DOCMOST_IMAGE__",
    "clusterIP: 10.43.30.30",
    "maxUnavailable: 0",
    "automountServiceAccountToken: false",
    "claimName: docmost-storage",
]
forbidden = [
    "DOCMOST_SSH_PRIVATE_KEY",
    "docker compose build",
    "scripts/deploy-book.sh",
    "git reset --hard origin/main",
]

errors = []
for needle in required_workflow:
    if needle not in WORKFLOW:
        errors.append(f"deploy workflow missing required boundary: {needle}")
for needle in required_runtime:
    if needle not in RUNTIME:
        errors.append(f"runtime manifest missing required boundary: {needle}")
for needle in forbidden:
    if needle in WORKFLOW:
        errors.append(f"deploy workflow reintroduced retired host path: {needle}")

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print("Kubernetes deployment policy OK: immutable image -> in-cluster rollout")
