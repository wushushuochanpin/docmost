#!/usr/bin/env python3
"""Check literal runner routes in the checked-out commit; stdlib only."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
LABEL = 'docmost-linux-checks'
MAC_FILES = {"ios-quality.yml"}
errors = []
for path in sorted((ROOT / ".github/workflows").glob("*")):
    if path.suffix not in {".yml", ".yaml"}:
        continue
    for number, line in enumerate(path.read_text().splitlines(), 1):
        if re.search(r"\bruns-on\s*:", line) and not line.lstrip().startswith("#"):
            match = re.fullmatch(r"\s+runs-on: ([\w.-]+)\s*(?:#.*)?", line)
            value = match.group(1) if match else "<dynamic or unsupported route>"
            if value == LABEL:
                continue
            if path.name in MAC_FILES and value.startswith("macos-"):
                continue
            errors.append(f"{path.relative_to(ROOT)}:{number}: disallowed runner {value}")
if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print(f"Runner policy OK: Linux -> {LABEL}; explicit macOS build exceptions preserved")
