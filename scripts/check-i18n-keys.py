#!/usr/bin/env python3
"""
Check that every t("...") / t('...') key used in the client source
has a corresponding translation in the zh-CN locale file.

Exit 0 if all keys are covered; exit 1 if any are missing.
"""

import os, re, json, sys

def main():
    strict = "--strict" in sys.argv
    repo_root = sys.argv[1] if len(sys.argv) > 1 else "."
    src_dir = os.path.join(repo_root, "apps/client/src")
    zh_path = os.path.join(repo_root, "apps/client/public/locales/zh-CN/translation.json")

    if not os.path.exists(zh_path):
        print(f"ERROR: zh-CN translation not found at {zh_path}")
        sys.exit(1)

    # Extract all t() keys from source
    keys_used = set()
    dynamic_keys = []

    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '__tests__', 'test')]
        for f in files:
            if not (f.endswith('.tsx') or f.endswith('.ts')):
                continue
            if f.endswith('.d.ts') or '.test.' in f or '.spec.' in f:
                continue
            fpath = os.path.join(root, f)
            try:
                with open(fpath) as fh:
                    content = fh.read()
            except Exception:
                continue

            rel = os.path.relpath(fpath, repo_root)

            # t("...")
            for m in re.finditer(r'\bt\s*\(\s*"((?:[^"\\]|\\.)*)"', content):
                keys_used.add(m.group(1))

            # t('...')
            for m in re.finditer(r"\bt\s*\(\s*'((?:[^'\\]|\\.)*)'", content):
                keys_used.add(m.group(1))

            # Dynamic t() calls (template literals, variables)
            for m in re.finditer(r'\bt\s*\(\s*[`$]', content):
                line = content[:m.start()].count('\n') + 1
                dynamic_keys.append(f"  {rel}:{line}")

    # Load zh-CN translations
    with open(zh_path) as f:
        zh = json.load(f)

    missing = sorted(k for k in keys_used if k not in zh)

    print(f"  t() keys in source:  {len(keys_used)}")
    print(f"  Keys in zh-CN:       {len(zh)}")
    print(f"  Missing from zh-CN:  {len(missing)}")
    print()

    if dynamic_keys:
        print(f"  Dynamic t() calls (cannot auto-check): {len(dynamic_keys)}")
        for dk in dynamic_keys[:20]:
            print(dk)
        if len(dynamic_keys) > 20:
            print(f"  ... and {len(dynamic_keys) - 20} more")
        print()

    if missing:
        print("MISSING KEYS:")
        for k in missing:
            print(f'  "{k}"')

    # Also check for hardcoded English-looking strings that might need i18n
    print()
    print("==> Checking for potential hardcoded English UI strings...")
    suspected = check_hardcoded_strings(src_dir)
    if suspected:
        print(f"  Suspected hardcoded English strings: {len(suspected)}")
        for s in suspected[:40]:
            print(f"  {s}")
        if len(suspected) > 40:
            print(f"  ... and {len(suspected) - 40} more")
    else:
        print("  None found.")

    if missing:
        print(f"\nERROR: {len(missing)} translation key(s) missing from zh-CN!")
        if strict:
            sys.exit(1)
        else:
            print("(Run with --strict to fail CI on missing keys)")
    else:
        print("\nAll translation keys are covered. ✓")

def check_hardcoded_strings(src_dir: str):
    """Find strings that look like English UI text but aren't going through t()."""
    suspected = []
    skip_patterns = [
        r'http[s]?://', r'/api/', r'\.svg', r'\.png', r'\.css', r'\.json',
        r'APP_URL', r'COLLAB_', r'POSTHOG', r'SUBDOMAIN', r'BILLING',
        r'ChunkLoad', r'AbortError', r'ERR_',
        r'ArrowUp', r'ArrowDown', r'ArrowLeft', r'ArrowRight',
        r'Enter', r'Escape', r'Home', r'End',
        r'Content-Type', r'application/json',
    ]

    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '__tests__', 'test')]
        for f in files:
            if not (f.endswith('.tsx') or f.endswith('.ts')):
                continue
            if f.endswith('.d.ts') or '.test.' in f or '.spec.' in f:
                continue
            fpath = os.path.join(root, f)
            try:
                with open(fpath) as fh:
                    content = fh.read()
            except Exception:
                continue

            rel = os.path.relpath(fpath, src_dir)

            for m in re.finditer(r'"([A-Z][A-Za-z].{10,90}?)"', content):
                s = m.group(1)
                before = content[max(0, m.start() - 30):m.start()]

                # Skip if preceded by t(
                if re.search(r'\bt\s*\($', before.strip()):
                    continue
                # Skip non-UI patterns
                if any(re.search(p, s) for p in skip_patterns):
                    continue
                if re.match(r'^[a-z]+:[A-Z]', s):
                    continue

                line = content[:m.start()].count('\n') + 1
                suspected.append(f"{rel}:{line} \"{s[:80]}\"")

    return suspected

if __name__ == '__main__':
    main()
