import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { MailError, type MailMessage, type SmtpProviderConfig } from "./types.ts";

export type SmtpTransport = {
  id: string;
  from: string;
  send(message: MailMessage): Promise<{ messageId?: string }>;
  close(): Promise<void>;
};

/** Create a nodemailer transport for one SMTP account. */
export function createSmtpTransport(config: SmtpProviderConfig): SmtpTransport {
  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === "implicit",
    ...(config.security === "starttls" ? { requireTLS: true } : {}),
    ...(config.username
      ? {
          auth: {
            user: config.username,
            pass: config.password ?? "",
          },
        }
      : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  return {
    id: config.id,
    from: config.from,
    async send(message) {
      try {
        const info = await transporter.sendMail({
          from: config.from,
          to: message.to,
          subject: message.subject,
          ...(message.text !== undefined ? { text: message.text } : {}),
          ...(message.html !== undefined ? { html: message.html } : {}),
          ...(message.replyTo !== undefined ? { replyTo: message.replyTo } : {}),
        });
        return { messageId: typeof info.messageId === "string" ? info.messageId : undefined };
      } catch (error) {
        throw new MailError(`smtp ${config.id} failed: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
    },
    async close() {
      transporter.close();
    },
  };
}
