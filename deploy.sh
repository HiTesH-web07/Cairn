#!/usr/bin/env bash
# Deploy Cairn to Embarko. Run from the repo root.
set -e
source ~/.embarko/credentials
tar --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='data' --exclude='.env' \
  -czf /tmp/cairn-deploy.tar.gz .
curl -sf -X POST https://ship.embarko.ai/apps \
  -H "Authorization: Bearer $DEPLOY_TOKEN" \
  -H "Content-Type: application/gzip" \
  -H "X-App-Name: proof-of-impact" \
  --data-binary "@/tmp/cairn-deploy.tar.gz"
echo "Deployed."
