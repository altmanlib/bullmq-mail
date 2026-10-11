# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM deps AS build
COPY src ./src
RUN bun build src/main.ts src/worker.ts --target=bun --outdir dist

FROM oven/bun:${BUN_VERSION}-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000

# Fully bundled entrypoints — no node_modules at runtime.
COPY --from=build /app/dist ./dist
COPY config/mail-providers.example.yml config/mail-providers.mailpit.yml ./config/

USER bun
EXPOSE 3000

# Same image for API and Worker; compose / k8s override the command.
ENTRYPOINT ["bun", "run"]
CMD ["dist/main.js"]
