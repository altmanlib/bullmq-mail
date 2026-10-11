import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { BunAdapter } from "@bull-board/bun";
import type { Job } from "bullmq";
import type { EnqueueMailInput } from "../queue/mail-jobs.ts";
import { enqueueMail, type MailQueue } from "../queue/mail-queue.ts";

export type ApiServer = {
  port: number;
  stop(): Promise<void>;
};

export function startApiServer(options: {
  host: string;
  port: number;
  queue: MailQueue;
}): ApiServer {
  const serverAdapter = new BunAdapter();
  serverAdapter.setBasePath("/ui");

  createBullBoard({
    queues: [new BullMQAdapter(options.queue)],
    serverAdapter,
  });

  const bullBoardRoutes = serverAdapter.getRoutes();

  const server = Bun.serve({
    hostname: options.host,
    port: options.port,
    routes: {
      "/health": {
        GET: async () => {
          const counts = await options.queue.getJobCounts(
            "waiting",
            "active",
            "completed",
            "failed",
            "delayed",
            "prioritized",
          );
          return Response.json({
            status: "ok",
            queue: options.queue.name,
            counts,
            ts: new Date().toISOString(),
          });
        },
      },

      "/api/mail": {
        POST: async (request) => {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return Response.json(
              { error: "invalid JSON body" },
              { status: 400 },
            );
          }

          const parsed = parseEnqueueBody(body);
          if ("error" in parsed) {
            return Response.json({ error: parsed.error }, { status: 400 });
          }

          try {
            const job = await enqueueMail(options.queue, parsed.input);
            return Response.json(
              {
                id: job.id,
                name: job.name,
                queue: options.queue.name,
              },
              { status: 202 },
            );
          } catch (error) {
            // BullMQ throws when jobId already exists (idempotency hit).
            const message =
              error instanceof Error ? error.message : String(error);
            if (
              message.includes("Job is already") ||
              message.toLowerCase().includes("exists")
            ) {
              return Response.json(
                {
                  error: "job with this idempotencyKey already exists",
                  idempotencyKey: parsed.input.idempotencyKey,
                },
                { status: 409 },
              );
            }
            throw error;
          }
        },
      },

      "/api/mail/:id": {
        GET: async (request) => {
          const id = (request as Request & { params: { id: string } }).params
            .id;
          const job = await options.queue.getJob(id);
          if (!job)
            return Response.json({ error: "job not found" }, { status: 404 });
          return Response.json(await serializeJob(job));
        },
      },

      ...bullBoardRoutes,
    },
  });

  if (server.port === undefined) {
    server.stop(true);
    throw new Error(`failed to bind API on ${options.host}:${options.port}`);
  }

  return {
    port: server.port,
    async stop() {
      server.stop(true);
      await options.queue.close();
    },
  };
}

function parseEnqueueBody(
  body: unknown,
): { input: EnqueueMailInput } | { error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "body must be an object" };
  }
  const raw = body as Record<string, unknown>;

  const to = parseRecipients(raw.to);
  if ("error" in to) return to;

  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  if (!subject) return { error: "subject is required" };

  const text = optionalString(raw.text);
  const html = optionalString(raw.html);
  if (!text && !html) return { error: "text or html is required" };

  const replyTo = optionalString(raw.replyTo);
  const idempotencyKey = optionalString(raw.idempotencyKey);
  const priority = optionalInt(raw.priority);
  if (typeof priority === "object") return priority;
  const delayMs = optionalInt(raw.delayMs);
  if (typeof delayMs === "object") return delayMs;

  return {
    input: {
      to: to.value,
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(delayMs !== undefined ? { delayMs } : {}),
    },
  };
}

function parseRecipients(
  value: unknown,
): { value: string | string[] } | { error: string } {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { error: "to is required" };
    return { value: trimmed };
  }
  if (Array.isArray(value)) {
    const list = value.map((item) => String(item).trim()).filter(Boolean);
    if (list.length === 0) return { error: "to is required" };
    return { value: list };
  }
  return { error: "to must be a string or string[]" };
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function optionalInt(value: unknown): number | undefined | { error: string } {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    return { error: "priority/delayMs must be a non-negative integer" };
  return n;
}

async function serializeJob(job: Job) {
  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    returnvalue: job.returnvalue,
    data: {
      to: job.data.to,
      subject: job.data.subject,
      idempotencyKey: job.data.idempotencyKey,
    },
  };
}
