import { createSmtpTransport, type SmtpTransport } from "./smtp.ts";
import { MailError, type Mailer, type MailMessage, type SmtpProviderConfig } from "./types.ts";

export type PooledProvider = {
  id: string;
  weight: number;
  cooldownMs: number;
  transport: SmtpTransport;
};

export type PoolOptions = {
  now?: () => number;
  random?: () => number;
  onFail?: (id: string, error: unknown) => void;
};

/**
 * Weighted SMTP pool with per-account cooldown after failure.
 * Each send picks an order by weight, skips resting accounts, and fails over to the next.
 */
export function createPoolMailer(providers: readonly SmtpProviderConfig[], options: PoolOptions = {}): Mailer & { close(): Promise<void> } {
  const enabled = providers.filter((p) => p.enabled);
  if (enabled.length === 0) throw new MailError("mail pool has no enabled providers");

  const pooled: PooledProvider[] = enabled.map((config) => ({
    id: config.id,
    weight: config.weight,
    cooldownMs: config.cooldownMs,
    transport: createSmtpTransport(config),
  }));

  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const resting = new Map<string, number>();

  return {
    id: "pool",
    async send(message: MailMessage) {
      const order = pickOrder(pooled, resting, now(), random);
      if (order.length === 0) throw new MailError("mail: every provider is resting after a failure");

      const failures: string[] = [];
      for (const provider of order) {
        try {
          const result = await provider.transport.send(message);
          resting.delete(provider.id);
          return { providerId: provider.id, messageId: result.messageId };
        } catch (error) {
          failures.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
          if (provider.cooldownMs > 0) resting.set(provider.id, now() + provider.cooldownMs);
          options.onFail?.(provider.id, error);
        }
      }
      throw new MailError(`mail: every provider failed: ${failures.join("; ")}`);
    },
    async close() {
      await Promise.all(pooled.map((p) => p.transport.close()));
    },
  };
}

function pickOrder(providers: readonly PooledProvider[], resting: Map<string, number>, at: number, random: () => number): PooledProvider[] {
  const candidates = providers.filter((provider) => {
    const until = resting.get(provider.id);
    return until === undefined || at >= until;
  });
  const order: PooledProvider[] = [];
  const pool = [...candidates];
  while (pool.length > 0) {
    const index = weightedIndex(pool, random);
    order.push(pool[index] as PooledProvider);
    pool.splice(index, 1);
  }
  return order;
}

function weightedIndex(pool: readonly PooledProvider[], random: () => number): number {
  const total = pool.reduce((sum, provider) => sum + provider.weight, 0);
  if (total <= 0) return 0;
  let point = random() * total;
  for (let index = 0; index < pool.length; index += 1) {
    point -= (pool[index] as PooledProvider).weight;
    if (point < 0) return index;
  }
  return pool.length - 1;
}
