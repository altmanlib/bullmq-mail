import { loadEnv } from "./config/env.ts";
import { bullmqConnection } from "./config/redis.ts";
import { runUntilSignal, shutdownWithin } from "./lifecycle.ts";
import { log } from "./log.ts";
import { createPoolMailer } from "./mail/pool.ts";
import { loadProvidersFile } from "./mail/providers.ts";
import { createMailWorker } from "./queue/mail-worker.ts";

const env = loadEnv();

const providers = loadProvidersFile(env.mail.providersFile);
const mailer = createPoolMailer(providers, {
  onFail: (id, error) => {
    log.warn("mail.provider.failed", { providerId: id }, error);
  },
});

const worker = createMailWorker({
  connection: bullmqConnection(env.redis),
  mailer,
  concurrency: env.worker.concurrency,
  rateMax: env.worker.rateMax,
  rateDurationMs: env.worker.rateDurationMs,
});

log.info("worker.started", {
  concurrency: env.worker.concurrency,
  rateMax: env.worker.rateMax,
  rateDurationMs: env.worker.rateDurationMs,
  providers: providers.filter((p) => p.enabled).map((p) => p.id),
  redis: `${env.redis.host}:${env.redis.port}/${env.redis.db}`,
});

await runUntilSignal(
  async (reason) => {
    log.info("worker.stopping", { reason, graceMs: env.shutdownGraceMs });
    const outcome = await shutdownWithin(env.shutdownGraceMs, {
      drain: async () => {
        // Waits for the active job(s) to finish, then stops taking new ones.
        await worker.close();
      },
      close: async () => {
        await mailer.close();
      },
    });
    log.info(outcome === "drained" ? "worker.stopped" : "worker.stopped.timeout", { outcome });
  },
  {
    forceExit: (signal) => {
      log.warn("worker.forced_exit", { signal });
      process.exit(1);
    },
  },
);
