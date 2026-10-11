#!/usr/bin/env bun
/**
 * Enqueue a sample mail job against a running API.
 *
 *   bun run scripts/enqueue-sample.ts --to you@example.com
 *   bun run scripts/enqueue-sample.ts --to you@example.com --subject "hello" --priority 1
 */

const args = parseArgs(Bun.argv.slice(2));
const baseUrl = (args.baseUrl ?? process.env.API_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const to = args.to;
if (!to) {
  console.error("usage: bun run scripts/enqueue-sample.ts --to <email> [--subject ...] [--text ...] [--html ...] [--idempotency-key ...] [--priority N] [--delay-ms N] [--base-url URL]");
  process.exit(1);
}

const body = {
  to,
  subject: args.subject ?? `BullMQ mail demo ${new Date().toISOString()}`,
  text: args.text ?? "This is a production-style BullMQ + SMTP pool demo email.",
  ...(args.html ? { html: args.html } : {}),
  ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
  ...(args.priority !== undefined ? { priority: Number(args.priority) } : {}),
  ...(args.delayMs !== undefined ? { delayMs: Number(args.delayMs) } : {}),
};

const response = await fetch(`${baseUrl}/api/mail`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const payload = await response.json();
console.log(JSON.stringify({ status: response.status, payload }, null, 2));
if (!response.ok) process.exit(1);

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
}
