import type { ConnectionOptions } from "bullmq";
import { Queue } from "bullmq";
import {
  buildMailJobOptions,
  defaultMailJobOptions,
  type EnqueueMailInput,
  MAIL_JOB_SEND,
  MAIL_QUEUE_NAME,
  type SendMailJobData,
  type SendMailJobResult,
  toJobData,
} from "./mail-jobs.ts";

export type MailQueue = Queue<SendMailJobData, SendMailJobResult, typeof MAIL_JOB_SEND>;

export function createMailQueue(connection: ConnectionOptions): MailQueue {
  return new Queue<SendMailJobData, SendMailJobResult, typeof MAIL_JOB_SEND>(MAIL_QUEUE_NAME, {
    connection,
    defaultJobOptions: defaultMailJobOptions,
  });
}

export async function enqueueMail(queue: MailQueue, input: EnqueueMailInput) {
  return queue.add(MAIL_JOB_SEND, toJobData(input), buildMailJobOptions(input));
}
