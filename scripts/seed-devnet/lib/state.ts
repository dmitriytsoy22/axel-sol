import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StepRecord {
  /** `pending`: signed and possibly sent; its fate is checked before anything else runs. */
  status: "pending" | "done";
  signature?: string;
  lastValidBlockHeight?: number;
  /** Why a step needed no transaction, e.g. the config already existed. */
  note?: string;
  at: string;
}

export interface SeedStateData {
  version: 1;
  cluster: string;
  programId: string;
  seed: string;
  scale: string;
  anchorDate: string;
  planHash: string;
  createdAt: string;
  /** Lamports the master wallet and the roles spent on this run, summed over invocations. */
  spentLamports: string;
  steps: Record<string, StepRecord>;
}

/**
 * The executor's checkpoint file. Every step is recorded twice: as `pending` with its
 * signature before the transaction is sent, and as `done` once it is confirmed. After a
 * crash, a pending signature is looked up on the cluster, so no step runs twice.
 */
export class SeedState {
  private constructor(
    readonly path: string,
    readonly data: SeedStateData,
  ) {}

  static exists(path: string): boolean {
    return existsSync(path);
  }

  static load(path: string): SeedState {
    const data = JSON.parse(readFileSync(path, "utf8")) as SeedStateData;
    if (data.version !== 1) {
      throw new Error(`${path} has unsupported version ${String(data.version)}`);
    }
    return new SeedState(path, data);
  }

  static create(
    path: string,
    header: Omit<SeedStateData, "version" | "steps" | "createdAt" | "spentLamports">,
  ): SeedState {
    const state = new SeedState(path, {
      version: 1,
      ...header,
      createdAt: new Date().toISOString(),
      spentLamports: "0",
      steps: {},
    });
    state.save();
    return state;
  }

  get(stepId: string): StepRecord | undefined {
    return this.data.steps[stepId];
  }

  isDone(stepId: string): boolean {
    return this.data.steps[stepId]?.status === "done";
  }

  markPending(stepId: string, signature: string, lastValidBlockHeight: number): void {
    this.data.steps[stepId] = { status: "pending", signature, lastValidBlockHeight, at: new Date().toISOString() };
    this.save();
  }

  markDone(stepId: string, result: { signature?: string; note?: string }): void {
    this.data.steps[stepId] = { status: "done", ...result, at: new Date().toISOString() };
    this.save();
  }

  clear(stepId: string): void {
    delete this.data.steps[stepId];
    this.save();
  }

  addSpent(lamports: bigint): bigint {
    const total = BigInt(this.data.spentLamports) + lamports;
    this.data.spentLamports = total.toString();
    this.save();
    return total;
  }

  signature(stepId: string): string | undefined {
    const record = this.data.steps[stepId];
    return record?.status === "done" ? record.signature : undefined;
  }

  /** Writes to a temporary file and renames it, so a crash never leaves half a file. */
  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`);
    renameSync(temporary, this.path);
  }
}
