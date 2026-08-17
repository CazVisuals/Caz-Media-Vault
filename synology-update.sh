#!/bin/sh
set -eu

PROJECT_DIRECTORY="${1:-/volume1/Caz Visuals/docker/constants-hub}"
cd "$PROJECT_DIRECTORY"
docker compose pull media-vault cloudflared
docker compose up -d --remove-orphans
docker image prune -f
