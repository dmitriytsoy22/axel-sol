import assert from "node:assert/strict";
import { EventParser, LangErrorCode, type IdlEvents } from "@coral-xyz/anchor";
import { FailedTransactionMetadata, type TransactionMetadata } from "litesvm";
import { InstructionErrorCustom, TransactionErrorInstructionError } from "litesvm/dist/internal.js";
import type { AxelV2 } from "../../target/types/axel_v2";
import { idl, program, PROGRAM_ID, type TxResult } from "./env";

export type AxelErrorName = Capitalize<AxelV2["errors"][number]["name"]>;
export type ErrorName = AxelErrorName | keyof typeof LangErrorCode;
export type EventName = keyof IdlEvents<AxelV2>;

/** The System Program's `AccountAlreadyInUse`, returned when `init` hits an existing account. */
export const SYSTEM_ACCOUNT_ALREADY_IN_USE = 0;

const errorCodes = new Map<string, number>([
  ...Object.entries(LangErrorCode),
  ...idl.errors.map((error): [string, number] => [error.name, error.code]),
]);

function describeFailure(result: FailedTransactionMetadata): string {
  return `${result.err().toString()}\n${result.meta().prettyLogs()}`;
}

export function expectOk(result: TxResult): TransactionMetadata {
  if (result instanceof FailedTransactionMetadata) {
    assert.fail(`expected the transaction to succeed, got ${describeFailure(result)}`);
  }
  return result;
}

/** Asserts that an instruction failed with exactly this custom error code. */
export function expectCustomError(result: TxResult, code: number, label = String(code)): void {
  if (!(result instanceof FailedTransactionMetadata)) {
    assert.fail(`expected ${label}, but the transaction succeeded\n${result.prettyLogs()}`);
  }
  const error = result.err();
  assert.ok(
    error instanceof TransactionErrorInstructionError,
    `expected ${label}, got ${describeFailure(result)}`,
  );
  const inner = error.err();
  assert.ok(
    inner instanceof InstructionErrorCustom,
    `expected ${label}, got ${describeFailure(result)}`,
  );
  assert.equal(inner.code, code, `expected ${label} (${code}), got ${describeFailure(result)}`);
}

/** Asserts that the transaction failed with the named axel_v2 or Anchor error. */
export function expectError(result: TxResult, name: ErrorName): void {
  const code = errorCodes.get(name);
  assert.ok(code !== undefined, `unknown error name ${name}`);
  expectCustomError(result, code, name);
}

const eventParser = new EventParser(PROGRAM_ID, program.coder);

/** Returns the single event of this kind emitted by the transaction. */
export function expectEvent<N extends EventName>(
  result: TransactionMetadata,
  name: N,
): IdlEvents<AxelV2>[N] {
  const events = [...eventParser.parseLogs(result.logs())].filter((event) => event.name === name);
  assert.equal(events.length, 1, `expected exactly one ${name} event, got ${events.length}`);
  return events[0].data as IdlEvents<AxelV2>[N];
}
