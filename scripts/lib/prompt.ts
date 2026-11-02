/**
 * Terminal prompts for the interactive scripts (`create-user`, `set-password`).
 */
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

export type Prompt = {
  ask(question: string, fallback?: string): Promise<string>;
  /** Reads a line without echoing it back to the terminal. */
  askSecret(question: string): Promise<string>;
  /** Repeats the prompt until the answer validates. */
  askValidated(
    question: string,
    validate: (v: string) => string | null,
    opts?: { secret?: boolean; fallback?: string },
  ): Promise<string>;
  close(): void;
};

export function createPrompt(): Prompt {
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });

  /**
   * Lines are buffered rather than read with readline/promises' `question()`.
   *
   * `question()` only captures the *next* line emitted after it is called. A
   * piped stdin delivers its whole buffer at once, so every line arriving while
   * we await a validation or a database round-trip is dropped, and the
   * following prompt then waits forever for input that has already gone past.
   * Interactive use never hits it; it made the scripts impossible to exercise
   * from a script.
   */
  const buffered: string[] = [];
  let waiting: ((line: string) => void) | null = null;
  let inputClosed = false;

  rl.on("line", (line) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
    } else {
      buffered.push(line);
    }
  });

  rl.on("close", () => {
    inputClosed = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve("");
    }
  });

  function nextLine(): Promise<string> {
    if (buffered.length > 0) return Promise.resolve(buffered.shift()!);
    if (inputClosed) {
      return Promise.reject(new Error("Input habis sebelum semua pertanyaan terjawab."));
    }
    return new Promise((resolve) => {
      waiting = resolve;
    });
  }

  async function ask(question: string, fallback?: string): Promise<string> {
    const suffix = fallback ? ` [${fallback}]` : "";
    stdout.write(`${question}${suffix}: `);
    const answer = (await nextLine()).trim();
    if (!stdin.isTTY) stdout.write(`${answer}\n`);
    return answer || fallback || "";
  }

  async function askSecret(question: string): Promise<string> {
    stdout.write(`${question}: `);

    // readline echoes keystrokes on a TTY, so the echo is suppressed at the
    // source while this prompt is open. The cast reaches an internal hook;
    // there is no public API for a masked prompt in node:readline. Piped input
    // is not echoed in the first place.
    const iface = rl as unknown as { _writeToOutput?: (s: string) => void };
    const original = iface._writeToOutput;
    if (stdin.isTTY) iface._writeToOutput = () => {};

    try {
      const answer = await nextLine();
      stdout.write("\n");
      return answer;
    } finally {
      if (stdin.isTTY) iface._writeToOutput = original;
    }
  }

  async function askValidated(
    question: string,
    validate: (v: string) => string | null,
    opts: { secret?: boolean; fallback?: string } = {},
  ): Promise<string> {
    for (;;) {
      const value = opts.secret ? await askSecret(question) : await ask(question, opts.fallback);
      const problem = validate(value);
      if (!problem) return value;
      console.error(`  ✗ ${problem}`);
    }
  }

  return { ask, askSecret, askValidated, close: () => rl.close() };
}

/**
 * The database a script is about to write to, for the confirmation screen:
 * host, port and database name — never the credentials.
 */
export function databaseHost(url = process.env.DATABASE_URL ?? ""): string {
  try {
    const u = new URL(url);
    return `${u.host}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(tidak diketahui)";
  }
}
