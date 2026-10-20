#!/usr/bin/env python3
"""Read-only comparison of an imported database and persistent image snapshot."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle-root', type=Path, required=True)
    parser.add_argument('--data-root', type=Path, default=Path('/var/lib/douyu'))
    args = parser.parse_args()
    source = json.loads((args.bundle_root / 'migration/source-manifest.json').read_text())
    files = json.loads((args.bundle_root / 'migration/files-manifest.json').read_text())
    cli = ['mysql', '--default-character-set=utf8mb4', '--batch', '--skip-column-names', 'bead_island']
    counts = {}
    for table, proof in sorted(source['rowProofs'].items()):
        names = [table] + proof['orderBy']
        if not all(re.fullmatch(r'[a-z_]+', name) for name in names):
            raise RuntimeError('Invalid snapshot identifier')
        order = ','.join('`' + name + '`' for name in proof['orderBy'])
        raw = subprocess.check_output(cli + ['-e', f'SELECT * FROM `{table}` ORDER BY {order}'])
        if hashlib.sha256(raw).hexdigest() != proof['sha256']:
            raise RuntimeError('Database content differs: ' + table)
        count = int(subprocess.check_output(cli + ['-e', f'SELECT COUNT(*) FROM `{table}`']))
        if count != source['counts'][table]:
            raise RuntimeError('Database count differs: ' + table)
        counts[table] = count
    for name, proof in files.items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise RuntimeError('Invalid snapshot path')
        target = args.data_root / relative
        if target.is_symlink() or not target.is_file():
            raise RuntimeError('Missing or invalid data file')
        if target.stat().st_size != proof['bytes'] or hashlib.sha256(target.read_bytes()).hexdigest() != proof['sha256']:
            raise RuntimeError('Image content differs')
    actual = {str(p.relative_to(args.data_root)) for p in args.data_root.rglob('*') if p.is_file()}
    if actual != set(files):
        raise RuntimeError('Persistent data file inventory differs')
    print(json.dumps({'databaseCounts': counts, 'rowHashesMatch': True,
                      'imageFiles': len(files), 'imageHashesMatch': True}))


if __name__ == '__main__':
    main()
