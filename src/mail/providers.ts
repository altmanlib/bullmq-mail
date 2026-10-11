import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { MailError, type SmtpProviderConfig, type SmtpSecurity } from "./types.ts";

type RawFile = {
  providers?: unknown;
};

type RawProvider = Record<string, unknown>;

/** Load and validate the SMTP account pool YAML. */
export function loadProvidersFile(path: string): SmtpProviderConfig[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new MailError(`cannot read mail providers file ${JSON.stringify(path)}`, { cause: error });
  }

  let raw: RawFile;
  try {
    raw = parseYaml(text) as RawFile;
  } catch (error) {
    throw new MailError(`invalid YAML in mail providers file ${JSON.stringify(path)}`, { cause: error });
  }

  if (!Array.isArray(raw.providers)) {
    throw new MailError(`mail providers file ${JSON.stringify(path)} must have a providers array`);
  }

  const providers = raw.providers.map((item, index) => parseProvider(item, index, path));
  const enabled = providers.filter((p) => p.enabled);
  if (enabled.length === 0) {
    throw new MailError(`mail providers file ${JSON.stringify(path)} has no enabled providers`);
  }
  return providers;
}

function parseProvider(item: unknown, index: number, path: string): SmtpProviderConfig {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new MailError(`${path}: providers[${index}] must be an object`);
  }
  const raw = item as RawProvider;
  const id = requiredString(raw.id, path, index, "id");
  const kind = requiredString(raw.kind, path, index, "kind");
  if (kind !== "smtp") throw new MailError(`${path}: providers[${index}].kind must be "smtp"`);

  const enabled = raw.enabled === undefined ? true : Boolean(raw.enabled);
  const weight = numberOr(raw.weight, 1);
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new MailError(`${path}: providers[${index}].weight must be > 0`);
  }

  const from = requiredString(raw.from, path, index, "from");
  const host = requiredString(raw.host, path, index, "host");
  const port = numberOr(raw.port, 465);
  if (!Number.isInteger(port) || port <= 0) {
    throw new MailError(`${path}: providers[${index}].port must be a positive integer`);
  }

  const security = parseSecurity(raw.security, port, path, index);
  const username = optionalString(raw.username);
  const password = raw.password === undefined || raw.password === null ? undefined : String(raw.password);

  return {
    id,
    kind: "smtp",
    enabled,
    weight,
    cooldownMs: parseCooldown(raw.cooldown, path, index),
    from,
    host,
    port,
    security,
    ...(username !== undefined ? { username } : {}),
    ...(password !== undefined ? { password } : {}),
  };
}

function parseSecurity(value: unknown, port: number, path: string, index: number): SmtpSecurity {
  if (value === undefined || value === null || value === "") {
    return port === 465 || port === 994 ? "implicit" : "starttls";
  }
  const s = String(value).trim().toLowerCase();
  if (s === "implicit" || s === "ssl" || s === "smtps") return "implicit";
  if (s === "starttls" || s === "tls") return "starttls";
  if (s === "plain" || s === "none") return "plain";
  throw new MailError(`${path}: providers[${index}].security must be implicit|starttls|plain`);
}

/** Accepts "2m", "30s", "500ms", or a bare millisecond number. */
function parseCooldown(value: unknown, path: string, index: number): number {
  if (value === undefined || value === null || value === "") return 120_000;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new MailError(`${path}: providers[${index}].cooldown must be >= 0`);
    }
    return value;
  }
  const text = String(value).trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(text);
  if (!match) throw new MailError(`${path}: providers[${index}].cooldown is invalid: ${JSON.stringify(value)}`);
  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  const mult = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
  return Math.round(amount * mult);
}

function requiredString(value: unknown, path: string, index: number, field: string): string {
  const s = optionalString(value);
  if (s === undefined) throw new MailError(`${path}: providers[${index}].${field} is required`);
  return s;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function numberOr(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  return Number(value);
}
