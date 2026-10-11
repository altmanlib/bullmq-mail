export type MailMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

export type SmtpSecurity = "implicit" | "starttls" | "plain";

export type SmtpProviderConfig = {
  id: string;
  kind: "smtp";
  enabled: boolean;
  weight: number;
  /** Milliseconds to rest after a send failure. */
  cooldownMs: number;
  from: string;
  host: string;
  port: number;
  security: SmtpSecurity;
  username?: string;
  password?: string;
};

export class MailError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MailError";
  }
}

export type Mailer = {
  id: string;
  send(message: MailMessage): Promise<{ providerId: string; messageId?: string }>;
};
