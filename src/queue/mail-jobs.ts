import type { JobsOptions } from "bullmq";
import type { MailMessage } from "../mail/types.ts";

export const MAIL_QUEUE_NAME = "mail";

/** Named job processed by the mail worker. */
export const MAIL_JOB_SEND = "send";

export type SendMailJobData = MailMessage & {
  /** Optional client-supplied idempotency key; used as BullMQ jobId when set. */
  idempotencyKey?: string;
};

export type SendMailJobResult = {
  providerId: string;
  messageId?: string;
};

export type EnqueueMailInput = SendMailJobData & {
  /** Lower number = higher priority. BullMQ default is undefined (normal). */
  priority?: number;
  /** Delay before the job becomes active, in milliseconds. */
  delayMs?: number;
};

/** Shared production defaults for every mail job. */
export const defaultMailJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 3_000,
  },
  // Keep recent history for the dashboard without unbounded Redis growth.
  removeOnComplete: {
    count: 1_000,
    age: 24 * 3600,
  },
  removeOnFail: {
    count: 5_000,
    age: 7 * 24 * 3600,
  },
};

export function buildMailJobOptions(input: EnqueueMailInput): JobsOptions {
  const { idempotencyKey, priority, delayMs } = input;
  return {
    ...defaultMailJobOptions,
    ...(idempotencyKey ? { jobId: idempotencyKey } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(delayMs !== undefined ? { delay: delayMs } : {}),
  };
}

export function toJobData(input: EnqueueMailInput): SendMailJobData {
  const { priority: _p, delayMs: _d, ...data } = input;
  return data;
}
