# syntax=docker/dockerfile:1

# Use the maintained Debian variant rather than the old Bullseye-based slim image.
# Bullseye package URLs in the previous image were returning 404 during apt-get.
FROM oven/bun:1-debian AS base

WORKDIR /app
ENV NODE_ENV=production

# Build dependencies for native Node/Bun modules.
FROM base AS build
RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential pkg-config python3 \
    && rm -rf /var/lib/apt/lists/*

COPY bun.lock package.json ./
RUN bun install

COPY . .
RUN bun run build

# Reinstall only production dependencies.
RUN rm -rf node_modules \
    && bun install --ci --production

# Runtime image
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app

EXPOSE 8080
CMD ["bun", "run", "start"]
