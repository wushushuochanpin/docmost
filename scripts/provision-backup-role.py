#!/usr/bin/env python3
"""Run on the documented production host. Values stay in Kubernetes and stdin."""
import base64
import datetime
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.parse


def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode:
        # SQL diagnostics can echo credential-bearing statements.
        raise RuntimeError(f"Operation failed: {args[0]} (exit {result.returncode}); inspect privately")
    return result.stdout


def secret(name):
    return json.loads(run(['kubectl', '-n', 'docmost', 'get', 'secret', name, '-o', 'json']))


runtime = secret('docmost-env')
migration = secret('docmost-migration-env')
if runtime['data'].get('BACKUP_DATABASE_URL'):
    raise RuntimeError('Remove privileged backup credentials from the application Secret first')
runtime_url = urllib.parse.urlsplit(base64.b64decode(runtime['data']['DATABASE_URL']).decode())
owner_url = urllib.parse.urlsplit(base64.b64decode(migration['data']['DATABASE_URL']).decode())
role = 'docmost_backup_reader'
existing = subprocess.run(['kubectl', '-n', 'docmost', 'get', 'secret', 'docmost-backup-env', '--ignore-not-found', '-o', 'json'], text=True, capture_output=True, check=True).stdout
if existing:
    backup_secret = json.loads(existing)
    backup_url = base64.b64decode(backup_secret['data']['BACKUP_DATABASE_URL']).decode()
    parsed = urllib.parse.urlsplit(backup_url)
    if parsed.username != role or (parsed.hostname, parsed.port, parsed.path) != (runtime_url.hostname, runtime_url.port, runtime_url.path):
        raise RuntimeError('Existing backup credential target differs; preserve and investigate')
    password = urllib.parse.unquote(parsed.password)
else:
    password = secrets.token_urlsafe(36)
    host = runtime_url.hostname
    if ':' in host:
        host = f'[{host}]'
    host += f':{runtime_url.port or 5432}'
    # Preserve libpq-compatible TLS options; Prisma's schema parameter is not libpq.
    query = urllib.parse.urlencode([(k, v) for k, v in urllib.parse.parse_qsl(runtime_url.query) if k != 'schema'])
    backup_url = urllib.parse.urlunsplit(('postgresql', f'{role}:{password}@{host}', runtime_url.path, query, ''))
    backup_secret = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'name': 'docmost-backup-env', 'namespace': 'docmost'}, 'type': 'Opaque', 'data': {'BACKUP_DATABASE_URL': base64.b64encode(backup_url.encode()).decode()}}

stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
archive = Path('/root/backups') / f'docmost_backup_role_{stamp}'
archive.mkdir(mode=0o700)
for name, obj in [('runtime', runtime), ('migration', migration), ('backup', backup_secret)]:
    with open(archive / f'{name}.json', 'x', opener=lambda path, flags: os.open(path, flags, 0o600)) as f:
        json.dump(obj, f)

quote = lambda value: '"' + value.replace('"', '""') + '"'
owner = urllib.parse.unquote(owner_url.username)
db = urllib.parse.unquote(runtime_url.path.lstrip('/'))
# Idempotent: existing credentials are preserved; no application role is widened.
statements = f"""
BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='{role}') THEN CREATE ROLE {role} LOGIN; END IF; END $$;
ALTER ROLE {role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS PASSWORD '{password.replace("'", "''")}';
ALTER ROLE {role} SET default_transaction_read_only=on;
GRANT CONNECT ON DATABASE {quote(db)} TO {role};
GRANT USAGE ON SCHEMA public TO {role};
GRANT SELECT ON ALL TABLES IN SCHEMA public TO {role};
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO {role};
ALTER DEFAULT PRIVILEGES FOR ROLE {quote(owner)} IN SCHEMA public GRANT SELECT ON TABLES TO {role};
ALTER DEFAULT PRIVILEGES FOR ROLE {quote(owner)} IN SCHEMA public GRANT SELECT ON SEQUENCES TO {role};
COMMIT;
"""
run(['docker', 'exec', '-i', 'docmost-db-1', 'psql', '-U', owner, '-d', db, '-v', 'ON_ERROR_STOP=1'], statements)
# Avoid kubectl apply's last-applied annotation containing an extra secret copy.
run(['kubectl', 'replace' if existing else 'create', '-f', '-'], json.dumps(backup_secret))
print(f'Backup role and isolated Secret provisioned; restricted recovery snapshot: {archive}')
