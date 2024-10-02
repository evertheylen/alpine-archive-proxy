#!/bin/bash

set -e

FLY_APP=$(grep "^app" fly.toml | sed "s/app = '\(.*\)'/\1/")

pnpm install
pnpm tsc -b .

DOCKER_BUILDKIT=1 docker build . -t alpine-archive-proxy
docker tag alpine-archive-proxy registry.fly.io/$FLY_APP
docker push registry.fly.io/$FLY_APP:latest

fly deploy
