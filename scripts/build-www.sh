#!/usr/bin/env bash
# Assemble the shippable static web app into ./www — the Capacitor webDir.
#
# There is NO build step: this is just a filtered copy of the same files
# GitHub / Cloudflare Pages already serve. Re-run after any asset change
# (or let `npx cap copy` invoke it). Everything dev-only (migrations, tests,
# workers, node_modules, the native projects) is excluded so only the
# runtime app gets bundled into the native binary.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf www
mkdir -p www
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'www' \
  --exclude 'ios' \
  --exclude 'android' \
  --exclude 'db' \
  --exclude 'test' \
  --exclude 'scripts' \
  --exclude 'worker' \
  --exclude 'supabase' \
  --exclude '.github' \
  --exclude '.wrangler' \
  --exclude '*.md' \
  --exclude 'config.dev.js' \
  --exclude 'config.dev.example.js' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude 'capacitor.config.json' \
  --exclude 'wrangler.jsonc' \
  --exclude '.gitignore' \
  --exclude 'CNAME' \
  ./ www/

echo "www/ assembled — $(find www -type f | wc -l) files:"
ls www | tr '\n' ' '; echo
