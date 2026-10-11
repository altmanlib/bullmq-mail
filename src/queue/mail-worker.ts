import type { ConnectionOptions, Job } from "bullmq";
import { Worker } from "bullmq";
import { log } from "../log.ts";
import type { Mailer } from "../mail/types.ts";
import { MAIL_JOB_SEND, MAIL_QUEUE_NAME, type SendMailJobData, type SendMailJobResult } from "./mail-jobs.ts";

export type MailWorkerOptions = {
  connection: ConnectionOptions;
  mailer: Mailer;
  concurrency: number;
  rateMax: number;
  rateDurationMs: number;
};

export type MailWorker = Worker<SendMailJobData, SendMailJobResult, typeof MAIL_JOB_SEND>;

export function createMailWorker(options: MailWorkerOptions): MailWorker {
  const worker = new Worker<SendMailJobData, SendMailJobResult, typeof MAIL_JOB_SEND>(MAIL_QUEUE_NAME, async (job) => processMailJob(job, options.mailer), {
    connection: options.connection,
    concurrency: options.concurrency,
    // Global rate limit across all worker processes for this queue.
    limiter: {
      max: options.rateMax,
      duration: options.rateDurationMs,
    },
  });

  worker.on("completed", (job, result) => {
    log.info("mail.job.completed", {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      providerId: result.providerId,
      messageId: result.messageId,
      to: job.data.to,
      subject: job.data.subject,
    });
  });

  worker.on("failed", (job, error) => {
    log.error(
      "mail.job.failed",
      {
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        to: job?.data.to,
        subject: job?.data.subject,
      },
      error,
    );
  });

  worker.on("error", (error) => {
    log.error("mail.worker.error", {}, error);
  });

  worker.on("stalled", (jobId) => {
    log.warn("mail.job.stalled", { jobId });
  });

  return worker;
}

async function processMailJob(job: Job<SendMailJobData, SendMailJobResult, typeof MAIL_JOB_SEND>, mailer: Mailer): Promise<SendMailJobResult> {
  if (job.name !== MAIL_JOB_SEND) {
    throw new Error(`unknown mail job name: ${job.name}`);
  }

  await job.updateProgress(10);
  await job.log(`sending via mailer=${mailer.id} attempt=${job.attemptsMade + 1}`);

  const result = await mailer.send({
    to: job.data.to,
    subject: job.data.subject,
    ...(job.data.text !== undefined ? { text: job.data.text } : {}),
    ...(job.data.html !== undefined ? { html: job.data.html } : {}),
    ...(job.data.replyTo !== undefined ? { replyTo: job.data.replyTo } : {}),
  });

  await job.updateProgress(100);
  await job.log(`sent via provider=${result.providerId} messageId=${result.messageId ?? "-"}`);

  return {
    providerId: result.providerId,
    ...(result.messageId !== undefined ? { messageId: result.messageId } : {}),
  };
}
