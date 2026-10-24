# syntax=docker/dockerfile:1

ARG BUN_VERSION=1
FROM oven/bun:${BUN_VERSION}-debian AS base

WORKDIR /app

# Build dependencies and application
FROM base AS build
ENV NODE_ENV=development

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       pkg-config \
       python3 \
       python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Runtime image
# Keep dependencies installed in the build stage because the start script uses tsx.
FROM base AS runtime
WORKDIR /app

COPY --from=build /app /app

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["bun", "run", "start"]
