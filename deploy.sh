#!/usr/bin/env bash
# Deploy Cairn to Embarko. Run from the repo root.
set -e
source ~/.embarko/credentials
tar --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='data' --exclude='.env' \
  -czf /tmp/cairn-deploy.tar.gz .
curl -sf -X POST https://ship.embarko.ai/apps \
  -H "Authorization: Bearer $DEPLOY_TOKEN" \
  -H "X-App-Name: cairn" \
  -F "source=@/tmp/cairn-deploy.tar.gz;type=application/gzip"
echo "Deployed — polling for live status..."
for i in $(seq 1 18); do
  sleep 10
  STATUS=$(curl -s https://ship.embarko.ai/apps/cairn/status \
    -H "Authorization: Bearer $DEPLOY_TOKEN" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  echo "  $STATUS"
  if [ "$STATUS" = "live" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "crashed" ]; then break; fi
done
