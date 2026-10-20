#!/usr/bin/env bash
set -euo pipefail

# First install only. Download both archive and checksum from the official vendor.
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
test ! -e /opt/node24
node_stage=$(mktemp -d /root/douyu-node24.XXXXXX)
chmod 700 "$node_stage"
cd "$node_stage"
curl --fail --show-error --location --proto '=https' --tlsv1.2 \
  --connect-timeout 15 --max-time 300 --output SHASUMS256.txt \
  https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
node_archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ { print $2 }' SHASUMS256.txt)
test -n "$node_archive"
test "$(printf '%s\n' "$node_archive" | wc -l)" = 1
node_directory=${node_archive%.tar.xz}
test ! -e "/opt/$node_directory"
curl --fail --show-error --location --proto '=https' --tlsv1.2 \
  --connect-timeout 15 --max-time 600 --output "$node_archive" \
  "https://nodejs.org/dist/latest-v24.x/$node_archive"
awk -v name="$node_archive" '$2 == name' SHASUMS256.txt | sha256sum --check -
tar --extract --xz --file "$node_archive" --directory /opt --no-same-owner
ln -s "/opt/$node_directory" /opt/node24
/opt/node24/bin/node --version
printf 'Official Node archive and checksum retained in %s\n' "$node_stage"
