import type { ConnectionOptions } from "bullmq";
import type { AppEnv } from "./env.ts";

/**
 * BullMQ connection options.
 * Pass the options object (not a shared ioredis instance) so Queue / Worker / QueueEvents
 * each get their own connection. Workers require maxRetriesPerRequest: null.
 */
export function bullmqConnection(env: AppEnv["redis"]): ConnectionOptions {
  return {
    host: env.host,
    port: env.port,
    db: env.db,
    ...(env.password ? { password: env.password } : {}),
    maxRetriesPerRequest: null,
  };
}
