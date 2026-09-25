/** A `sol_log_data` record written by the program, in log order. */
export interface LoggedEvent {
  /** Position among the program's records in the transaction, from 0. */
  index: number;
  /** The record as logged: base64 of the Anchor event discriminator and its Borsh data. */
  data: string;
}

export interface ProgramLogEvents {
  events: LoggedEvent[];
  /**
   * The runtime cut the logs off (`Log truncated`), so records written after that point
   * are missing from `events`.
   */
  truncated: boolean;
}

const INVOKE = /^Program (\S+) invoke \[\d+\]$/;
// Only logs of successful transactions are read, so every invoke ends in `success`.
const SUCCESS = /^Program \S+ success$/;
const DATA_PREFIX = 'Program data: ';
const TRUNCATED = 'Log truncated';

/**
 * Collects the records `programId` itself wrote to a transaction's logs. The invoke stack
 * is followed line by line, so records written while the program runs as a CPI (the share
 * transfer hook runs inside Token-2022) count, and records of any other program do not.
 * Anchor's own `EventParser` misses the CPI case.
 */
export function programLogEvents(logs: readonly string[], programId: string): ProgramLogEvents {
  const stack: string[] = [];
  const events: LoggedEvent[] = [];
  for (const line of logs) {
    if (line === TRUNCATED) {
      return { events, truncated: true };
    }
    const invoke = INVOKE.exec(line);
    if (invoke !== null) {
      stack.push(invoke[1]);
      continue;
    }
    if (SUCCESS.test(line)) {
      stack.pop();
      continue;
    }
    if (line.startsWith(DATA_PREFIX) && stack[stack.length - 1] === programId) {
      events.push({ index: events.length, data: line.slice(DATA_PREFIX.length) });
    }
  }
  return { events, truncated: false };
}
