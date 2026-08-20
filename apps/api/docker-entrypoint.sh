#!/bin/sh
set -e

# Compose already gates on `pg_isready`, but a container can still race a
# database that is accepting connections and not yet ready to run DDL. Retrying
# here keeps a cold start from turning into a crash loop.
attempts=0
until npm run --silent migrate --workspace=apps/api; do
	attempts=$((attempts + 1))
	if [ "$attempts" -ge 10 ]; then
		echo "migrations failed after $attempts attempts; refusing to start" >&2
		exit 1
	fi
	echo "migrations not applied yet (attempt $attempts); retrying in 3s" >&2
	sleep 3
done

exec "$@"
