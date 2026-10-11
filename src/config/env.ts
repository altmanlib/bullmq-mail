/** Process env reader. Throws with a clear name when a required value is missing or invalid. */

export type AppEnv = {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  api: {
    host: string;
    port: number;
  };
  mail: {
    providersFile: string;
  };
  worker: {
    concurrency: number;
    rateMax: number;
    rateDurationMs: number;
  };
  shutdownGraceMs: number;
};

type Env = Record<string, string | undefined>;

export function loadEnv(env: Env = process.env): AppEnv {
  return {
    redis: {
      host: str(env.REDIS_HOST, "127.0.0.1"),
      port: int(env.REDIS_PORT, 6379, "REDIS_PORT"),
      ...(optional(env.REDIS_PASSWORD) ? { password: env.REDIS_PASSWORD } : {}),
      db: int(env.REDIS_DB, 0, "REDIS_DB"),
    },
    api: {
      host: str(env.API_HOST, "0.0.0.0"),
      port: int(env.API_PORT, 3000, "API_PORT"),
    },
    mail: {
      providersFile: str(env.MAIL_PROVIDERS_FILE, "./config/mail-providers.yml"),
    },
    worker: {
      concurrency: int(env.WORKER_CONCURRENCY, 3, "WORKER_CONCURRENCY"),
      rateMax: int(env.WORKER_RATE_MAX, 5, "WORKER_RATE_MAX"),
      rateDurationMs: int(env.WORKER_RATE_DURATION_MS, 1000, "WORKER_RATE_DURATION_MS"),
    },
    shutdownGraceMs: int(env.SHUTDOWN_GRACE_MS, 20_000, "SHUTDOWN_GRACE_MS"),
  };
}

function str(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function optional(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function int(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}
