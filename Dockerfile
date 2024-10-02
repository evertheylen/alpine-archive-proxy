# syntax=docker/dockerfile:1.10

# Base image
FROM node:22-alpine3.19

# PNPM stuff
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# RUN apk update && \
#   apk add --no-cache gcc musl-dev libffi-dev openssl-dev sqlite-dev nginx curl bash python3

RUN mkdir -p /packages
RUN mkdir -p /app

COPY ./package.json /app/package.json
COPY ./pnpm-lock.yaml /app/pnpm-lock.yaml
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

COPY ./dist/ /app/dist/

ENV PACKAGES_DIR=/packages

EXPOSE 80

CMD ["node", "./dist/index.js"]
