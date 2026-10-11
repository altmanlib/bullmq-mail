import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import {
  MAIL_JOB_SEND,
  MAIL_QUEUE_NAME,
  buildMailJobOptions,
  defaultMailJobOptions,
  toJobData,
  type EnqueueMailInput,
  type SendMailJobData,
  type SendMailJobResult,
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
