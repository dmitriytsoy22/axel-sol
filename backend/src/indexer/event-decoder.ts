import type { IdlField, IdlType, IdlTypeDef } from '@coral-xyz/anchor/dist/cjs/idl';
import type { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';

import type { AxelProgram } from '../solana/axel-program';
import rawIdl from '../solana/idl/axel_v2.json';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type EventData = Record<string, JsonValue>;

export interface DecodedEvent {
  /** The event's name in the program, e.g. `RevenueDeposited`. */
  type: string;
  /**
   * Fields in camelCase. Public keys are base58, byte arrays hex, 64- and 128-bit integers
   * decimal strings, and enums the variant name.
   */
  data: EventData;
}

const SMALL_INTEGERS = new Set(['u8', 'i8', 'u16', 'i16', 'u32', 'i32']);
const LARGE_INTEGERS = new Set(['u64', 'i64', 'u128', 'i128']);
const DISCRIMINATOR_LENGTH = 8;

/** Decodes the program's Anchor events with the vendored IDL into JSON-safe values. */
export class EventDecoder {
  /** Every event type of the IDL, as the program names it. */
  readonly types: readonly string[];
  private readonly program: AxelProgram;
  /** Coder name (camelCase) to program name (PascalCase). */
  private readonly typeNames: Map<string, string>;
  private readonly definitions: Map<string, IdlTypeDef>;

  constructor(program: AxelProgram) {
    this.program = program;
    const coderNames = (program.idl.events ?? []).map((event) => event.name);
    this.types = rawIdl.events.map((event) => event.name);
    this.typeNames = new Map(coderNames.map((name, index) => [name, this.types[index]]));
    this.definitions = new Map((program.idl.types ?? []).map((type) => [type.name, type]));
    for (const name of coderNames) {
      this.fieldsOf(name).forEach((field) => this.assertSupported(field.type));
    }
  }

  /**
   * `null` when the record is not an event of this IDL: an unknown discriminator, or bytes
   * that do not have the layout the IDL gives that event.
   */
  decode(base64: string): DecodedEvent | null {
    let event: { name: string; data: Record<string, unknown> } | null;
    try {
      event = this.program.coder.events.decode(base64);
    } catch {
      // Borsh throws on some layouts when the bytes run out.
      return null;
    }
    if (event === null) {
      return null;
    }
    // Borsh reads missing bytes as zeros on other layouts and ignores extra ones, so only an
    // exact round trip shows that the record really has the IDL's layout.
    const body = Buffer.from(base64, 'base64').subarray(DISCRIMINATOR_LENGTH);
    if (!this.program.coder.types.encode(event.name, event.data).equals(body)) {
      return null;
    }
    const data: EventData = {};
    for (const field of this.fieldsOf(event.name)) {
      data[field.name] = this.toJson(field.type, event.data[field.name]);
    }
    return { type: this.typeNames.get(event.name) as string, data };
  }

  private fieldsOf(typeName: string): IdlField[] {
    const definition = this.definitions.get(typeName);
    if (definition?.type.kind !== 'struct') {
      throw new Error(`IDL type ${typeName} is not a struct`);
    }
    return (definition.type.fields ?? []) as IdlField[];
  }

  private toJson(type: IdlType, value: unknown): JsonValue {
    if (type === 'pubkey') {
      return (value as PublicKey).toBase58();
    }
    if (type === 'bool') {
      return value as boolean;
    }
    if (typeof type === 'string' && SMALL_INTEGERS.has(type)) {
      return value as number;
    }
    if (typeof type === 'string' && LARGE_INTEGERS.has(type)) {
      return (value as BN).toString(10);
    }
    if (typeof type === 'object' && 'array' in type) {
      const items = value as unknown[];
      if (type.array[0] === 'u8') {
        return Buffer.from(items as number[]).toString('hex');
      }
      return items.map((item) => this.toJson(type.array[0], item));
    }
    if (typeof type === 'object' && 'defined' in type) {
      // Every defined type in an event is an enum of unit variants; the constructor checks it.
      return Object.keys(value as Record<string, unknown>)[0];
    }
    throw new Error(`Unsupported IDL type in an event: ${JSON.stringify(type)}`);
  }

  private assertSupported(type: IdlType): void {
    if (
      type === 'pubkey' ||
      type === 'bool' ||
      (typeof type === 'string' && (SMALL_INTEGERS.has(type) || LARGE_INTEGERS.has(type)))
    ) {
      return;
    }
    if (typeof type === 'object' && 'array' in type) {
      this.assertSupported(type.array[0]);
      return;
    }
    if (typeof type === 'object' && 'defined' in type) {
      const definition = this.definitions.get(type.defined.name);
      if (
        definition?.type.kind === 'enum' &&
        definition.type.variants.every((variant) => variant.fields === undefined)
      ) {
        return;
      }
    }
    throw new Error(`Unsupported IDL type in an event: ${JSON.stringify(type)}`);
  }
}
