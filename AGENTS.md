# bullmq-mail agent notes

- Runtime: Bun + TypeScript 6
- Package manager: `bun`
- Queue: BullMQ (requires `ioredis` connection options; do not replace with `Bun.redis`)
- HTTP: `Bun.serve` routes; Bull Board via `@bull-board/bun`
- Mail: nodemailer + YAML SMTP account pool (`config/mail-providers.yml`)
- Processes: `src/main.ts` (API/Queue) and `src/worker.ts` (Worker) stay separate
- Image: multi-stage `Dockerfile` on `oven/bun:<ver>-alpine`; same image, different CMD for API/Worker
- Compose: `compose.yml` (dev bind-mount) / `compose-prod.yml` (build image); host ports are random — use `docker compose port <service> <port>`
