type SignalSource = {
  on(event: string, listener: () => void): unknown;
  off?(event: string, listener: () => void): unknown;
};

/**
 * Run until the first SIGINT / SIGTERM (or a second signal forces exit).
 * forceExit is injected so this module stays free of process.exit and logging.
 */
export function runUntilSignal(
  stop: (reason: string) => Promise<void>,
  options: {
    signals?: SignalSource;
    forceExit: (signal: string) => void;
  },
): Promise<void> {
  const signals = options.signals ?? process;
  let stopping: Promise<void> | undefined;

  return new Promise<void>((resolve, reject) => {
    const begin = (reason: string): boolean => {
      if (stopping) return false;
      stopping = stop(reason);
      stopping.then(resolve, reject);
      return true;
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      signals.on(signal, () => {
        if (!begin(signal)) options.forceExit(signal);
      });
    }
  });
}

/** Race drain against a grace window; always run close afterward. */
export async function shutdownWithin(graceMs: number, hooks: { drain: () => Promise<void>; close: () => Promise<void> }): Promise<"drained" | "timeout"> {
  let outcome: "drained" | "timeout" = "drained";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      hooks.drain(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          outcome = "timeout";
          resolve();
        }, graceMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    await hooks.close();
  }
  return outcome;
}
