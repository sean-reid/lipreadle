#!/usr/bin/env sh
# Creates the R2 bucket and D1 database if they do not exist. Safe to rerun.
# The D1 id it prints has to match database_id in wrangler.jsonc.
set -eu

bucket=lipreadle-clips
db=lipreadle

if npx wrangler r2 bucket list | grep -qx "name: *$bucket"; then
  echo "bucket $bucket exists"
else
  npx wrangler r2 bucket create "$bucket"
fi

if npx wrangler d1 list --json | grep -q "\"name\": *\"$db\""; then
  echo "database $db exists"
else
  npx wrangler d1 create "$db"
fi

id=$(npx wrangler d1 list --json | node -e '
  const dbs = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const db = dbs.find((d) => d.name === process.argv[1]);
  if (db) process.stdout.write(db.uuid);
' "$db")
echo "d1 database_id: $id"
if ! grep -q "$id" wrangler.jsonc; then
  echo "wrangler.jsonc database_id does not match; update it to $id" >&2
  exit 1
fi
