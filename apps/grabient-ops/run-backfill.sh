#!/bin/bash
cursor="$1"
for i in {1..50}; do
  result=$(npx convex run backfill:backfillEmbedTextWithColorNames "{\"batchSize\": 500, \"cursor\": \"$cursor\"}" 2>&1)
  processed=$(echo "$result" | grep -o '"processed": [0-9]*' | head -1 | grep -o '[0-9]*')
  hasMore=$(echo "$result" | grep -o '"hasMore": [a-z]*' | head -1 | grep -oE 'true|false')
  cursor=$(echo "$result" | grep -o '"nextCursor": "[^"]*"' | head -1 | sed 's/"nextCursor": "//;s/"$//')
  echo "Batch $i: processed=$processed hasMore=$hasMore"
  if [ "$hasMore" = "false" ]; then
    echo "DONE!"
    exit 0
  fi
done
echo "Final cursor: $cursor"
