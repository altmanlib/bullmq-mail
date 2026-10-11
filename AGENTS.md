# bullmq-mail agent notes

- Runtime: Bun + TypeScript 6
- Package manager: `bun`
- Queue: BullMQ (requires `ioredis` connection options; do not replace with `Bun.redis`)
- HTTP: `Bun.serve` routes; Bull Board via `@bull-board/bun`
- Mail: nodemailer + YAML SMTP account pool (`config/mail-providers.yml`)
- Processes: `src/main.ts` (API/Queue) and `src/worker-main.ts` (Worker) stay separate
- Compose: Redis / API / Worker; host ports are random — use `docker compose port <service> <port>`
