#!/bin/sh
set -e

until nc -z db 5432; do
  echo "Waiting for database..."
  sleep 2
done

echo "Running Prisma migrations..."
npx prisma migrate deploy || { echo "❌ Migration failed"; exit 1; }

echo "Running Prisma seed..."
npm run db:seed:prod || { echo "❌ Seed failed"; exit 1; }

echo "Starting the application..."
exec "$@"
