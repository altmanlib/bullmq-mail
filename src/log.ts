type Fields = Record<string, unknown>;

function line(
  level: string,
  event: string,
  fields?: Fields,
  error?: unknown,
): string {
  const payload: Fields = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  if (error !== undefined) {
    payload.error =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) };
  }
  return JSON.stringify(payload);
}

export const log = {
  info(event: string, fields?: Fields) {
    console.log(line("info", event, fields));
  },
  warn(event: string, fields?: Fields, error?: unknown) {
    console.warn(line("warn", event, fields, error));
  },
  error(event: string, fields?: Fields, error?: unknown) {
    console.error(line("error", event, fields, error));
  },
};
