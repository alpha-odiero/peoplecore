#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS" != "false" ]; then
  ./node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma
fi

exec "$@"
