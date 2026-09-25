import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, closeSync, openSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { LOG_DIR } from './config';

/** A child process of the stack; its output goes to `<LOG_DIR>/<name>.log`. */
export interface Service {
  name: string;
  log: string;
  /** Resolves with the exit code, or null when a signal ended it or it never started. */
  exited: Promise<number | null>;
  hasExited: () => boolean;
}

const running = new Map<Service, ChildProcess>();

/*
 * If the runner dies without its teardown (a crash, a second Ctrl-C), nothing may outlive it:
 * a leftover validator or dev server would hold the ports of the next run.
 */
process.on('exit', () => {
  for (const child of running.values()) killGroup(child, 'SIGKILL');
});

/**
 * The environment every child starts from: enough to find the tools, and nothing else from
 * the developer's shell, so a run does not depend on what happens to be exported there. The
 * whole stack runs in development mode; `npm ci` then also installs the seed's tsx.
 */
export function childEnv(variables: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'development' };
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'CI']) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return { ...env, ...variables };
}

/** The last lines of a service's log, for an error message. */
export function logTail(service: Service, lines = 30): string {
  const text = readFileSync(service.log, 'utf8').trimEnd().split('\n');
  return text.slice(-lines).join('\n');
}

/**
 * Starts a process in a group of its own, so stopping it also stops whatever it spawned
 * (`next dev` runs its server in a child process).
 */
export function start(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Service {
  const log = join(LOG_DIR, `${name}.log`);
  const output = openSync(log, 'a');
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', output, output],
    detached: true,
  });
  closeSync(output);

  let done = false;
  const service: Service = {
    name,
    log,
    exited: new Promise((resolve) => {
      child.on('exit', (code) => {
        done = true;
        running.delete(service);
        resolve(code);
      });
      child.on('error', (error) => {
        done = true;
        running.delete(service);
        appendFileSync(log, `could not start ${command}: ${error.message}\n`);
        resolve(null);
      });
    }),
    hasExited: () => done,
  };
  running.set(service, child);
  return service;
}

/** Runs a command to completion; throws with the end of its log unless it exits with 0. */
export async function run(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  const service = start(name, command, args, options);
  const code = await service.exited;
  if (code !== 0) {
    throw new Error(
      `${name} failed with exit code ${code}; ${service.log} ends with:\n${logTail(service)}`,
    );
  }
}

/** A probe's answer that waiting longer cannot change, such as a page that fails to compile. */
export class StackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StackError';
  }
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // fetch reports "fetch failed" and keeps the reason, e.g. ECONNREFUSED, in `cause`.
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}

/**
 * Polls `probe` until it returns a value. A probe that throws (a server not listening yet)
 * is tried again, and its last error is reported if time runs out; a StackError ends the wait
 * at once. So does the exit of `service`, since then the wait can never succeed.
 */
export async function waitFor<T>(
  what: string,
  probe: () => Promise<T | undefined>,
  { timeoutMs, service }: { timeoutMs: number; service?: Service },
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (service?.hasExited()) {
      throw new Error(
        `${service.name} exited while waiting for ${what}; ${service.log} ends with:\n${logTail(service)}`,
      );
    }
    try {
      const value = await probe();
      if (value !== undefined) return value;
    } catch (error) {
      if (error instanceof StackError) throw new StackError(`${what}: ${error.message}`);
      lastError = error;
    }
    await delay(500);
  }
  const reason = lastError === undefined ? '' : `: ${describe(lastError)}`;
  throw new Error(`Timed out after ${timeoutMs / 1000} s waiting for ${what}${reason}`);
}

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    // ESRCH: the group is already gone.
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

/** Stops every running service: SIGTERM to its group, SIGKILL if it is still there after 20 s. */
export async function stopAll(): Promise<void> {
  await Promise.all(
    [...running.entries()].map(async ([service, child]) => {
      killGroup(child, 'SIGTERM');
      let grace: NodeJS.Timeout | undefined;
      const stopped = await Promise.race([
        service.exited.then(() => true),
        new Promise<false>((resolve) => {
          grace = setTimeout(() => resolve(false), 20_000);
        }),
      ]);
      clearTimeout(grace);
      if (!stopped) killGroup(child, 'SIGKILL');
      await service.exited;
      // Workers the service spawned may outlive it by a moment; they share its group.
      killGroup(child, 'SIGKILL');
    }),
  );
}

/** Throws naming every port something already accepts connections on. */
export async function assertPortsFree(ports: { name: string; port: number }[]): Promise<void> {
  const taken: string[] = [];
  for (const { name, port } of ports) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (open) taken.push(`${port} (${name})`);
  }
  if (taken.length > 0) {
    throw new Error(
      `Ports the e2e stack needs are in use: ${taken.join(', ')}. Stop what listens there; ` +
        'a previous run that was killed may have left its processes behind.',
    );
  }
}
