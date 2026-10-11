import { startApiServer } from "./api/server.ts";
import { loadEnv } from "./config/env.ts";
import { bullmqConnection } from "./config/redis.ts";
import { runUntilSignal } from "./lifecycle.ts";
import { log } from "./log.ts";
import { createMailQueue } from "./queue/mail-queue.ts";

const env = loadEnv();

const queue = createMailQueue(bullmqConnection(env.redis));
const api = startApiServer({
  host: env.api.host,
  port: env.api.port,
  queue,
});

log.info("api.started", {
  host: env.api.host,
  port: api.port,
  redis: `${env.redis.host}:${env.redis.port}/${env.redis.db}`,
  health: `http://127.0.0.1:${api.port}/health`,
});

await runUntilSignal(
  async (reason) => {
    log.info("api.stopping", { reason });
    await api.stop();
    log.info("api.stopped");
  },
  {
    forceExit: (signal) => {
      log.warn("api.forced_exit", { signal });
      process.exit(1);
    },
  },
);
