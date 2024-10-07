# syntax=docker/dockerfile:1.10

FROM node:22-alpine3.20

RUN apk add --no-cache abuild

RUN mkdir -p /packages
RUN mkdir -p /app

COPY ./package.json /app/package.json
WORKDIR /app

COPY ./src/start.sh /app/start.sh
COPY ./dist/ /app/dist/

ENV PACKAGES_DIR=/packages

EXPOSE 80

CMD ["ash", "/app/start.sh"]

