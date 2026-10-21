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
    "for attempt in 1 2 3 4 5 6",
]
MIGRATION = (ROOT / "deploy/k8s/production/migration.yaml").read_text()
required_workflow += ["docmost-migration-env", "migration.yaml", "Database migration failed; application rollout was not started"]
required_runtime = [
    "image: __DOCMOST_IMAGE__",
    "clusterIP: 10.43.30.30",
    "maxUnavailable: 0",
    "automountServiceAccountToken: false",
    "runAsUser: 1000",
    "runAsGroup: 1000",
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
if "docmost-migration-env" in RUNTIME:
    errors.append("privileged migration credential must not enter the application pod")
for needle in ["backoffLimit: 0", "activeDeadlineSeconds: 600", "docmost-migration-env", '"latest"', "image: __DOCMOST_IMAGE__", "automountServiceAccountToken: false"]:
    if needle not in MIGRATION:
        errors.append(f"migration job missing required boundary: {needle}")
if WORKFLOW.index("Apply migrations with the isolated migration credential") > WORKFLOW.index("Apply the exact image digest"):
    errors.append("migrations must complete before application rollout")
for needle in forbidden:
    if needle in WORKFLOW:
        errors.append(f"deploy workflow reintroduced retired host path: {needle}")

public_health = "https://book.superchat.help/api/health"
source_annotation = '"docmost.dev/source-sha=${GITHUB_SHA}"'
if public_health in WORKFLOW and source_annotation in WORKFLOW:
    if WORKFLOW.index(source_annotation) < WORKFLOW.index(public_health):
        errors.append("deploy identity must only be recorded after public health passes")

BACKUP = (ROOT / "deploy/k8s/production/backup-worker.yaml").read_text()
BACKUP_CI = (ROOT / ".github/workflows/backup-regression.yml").read_text()
for needle in ["needs: backup-regression", "uses: ./.github/workflows/backup-regression.yml", "docmost-backup-env", "backup-worker.yaml", "backup-smoke.js", "previous_backup_image=", "previous_backup_replicas=", "rollout status deployment/docmost-backup"]:
    if needle not in WORKFLOW:
        errors.append(f"backup deployment gate missing: {needle}")
for needle in ["workflow_call:", "pull_request:", "pnpm run test:backup"]:
    if needle not in BACKUP_CI:
        errors.append(f"backup regression workflow missing: {needle}")
for needle in ["docmost-backup-env", "BACKUP_DATABASE_URL", "backup-worker.js", "automountServiceAccountToken: false", "readOnly: true", "subPath: backups", "readinessProbe:"]:
    if needle not in BACKUP:
        errors.append(f"isolated backup worker boundary missing: {needle}")
for name, manifest in [("application", RUNTIME), ("backup worker", BACKUP)]:
    if "name: BACKUP_LOCAL_PATH\n              value: /app/data/storage/backups" not in manifest:
        errors.append(f"{name} must use the same persistent backup directory")
for needle in ["docmost-backup-env", "BACKUP_DATABASE_URL"]:
    if needle in RUNTIME:
        errors.append("backup credential must never enter application pod")
if "docmost-migration-env" in BACKUP or "envFrom:" in BACKUP:
    errors.append("backup worker must use explicitly scoped secret keys")
if WORKFLOW.index("backup-smoke.js") > WORKFLOW.index(source_annotation):
    errors.append("backup verification must pass before recording deployment identity")
if "BackupProcessor" in (ROOT / "apps/server/src/integrations/backup/backup.module.ts").read_text():
    errors.append("application must not consume privileged backup jobs")

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print("Kubernetes deployment policy OK: immutable image -> in-cluster rollout")
