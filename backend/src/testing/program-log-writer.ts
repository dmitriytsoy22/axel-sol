import { Connection, type PublicKey } from '@solana/web3.js';

import { type AxelProgram, createAxelProgram } from '../solana/axel-program';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '../solana/program-accounts';

const TOKEN = TOKEN_PROGRAM_ID.toBase58();
const TOKEN_2022 = TOKEN_2022_PROGRAM_ID.toBase58();

/**
 * Writes transaction logs the way the runtime does for axel_v2, with events encoded by the
 * IDL coder exactly as `emit!` logs them (discriminator and Borsh data, base64).
 */
export class ProgramLogWriter {
  private readonly program: AxelProgram;
  private readonly id: string;

  constructor(programId: PublicKey) {
    this.program = createAxelProgram(new Connection('http://127.0.0.1:1'), programId);
    this.id = programId.toBase58();
  }

  /** An event as `emit!` logs it; `type` is the program's name, e.g. `Claimed`. */
  event(type: string, data: Record<string, unknown>): string {
    const name = type[0].toLowerCase() + type.slice(1);
    const definition = (this.program.idl.events ?? []).find((event) => event.name === name);
    if (definition === undefined) {
      throw new Error(`No event ${type} in the IDL`);
    }
    return Buffer.concat([
      Buffer.from(definition.discriminator),
      this.program.coder.types.encode(name, data),
    ]).toString('base64');
  }

  /**
   * A top-level axel_v2 instruction (`name` as Anchor logs it, e.g. `BuyShares`) that emits
   * `events` after paying through the SPL Token program, as `buy_shares` or `claim` do.
   */
  instruction(name: string, events: string[]): string[] {
    return [
      `Program ${this.id} invoke [1]`,
      `Program log: Instruction: ${name}`,
      `Program ${TOKEN} invoke [2]`,
      'Program log: Instruction: TransferChecked',
      `Program data: ${Buffer.from('not an axel_v2 event').toString('base64')}`,
      `Program ${TOKEN} consumed 6200 of 180000 compute units`,
      `Program ${TOKEN} success`,
      ...events.map((event) => `Program data: ${event}`),
      `Program ${this.id} consumed 41000 of 200000 compute units`,
      `Program ${this.id} success`,
    ];
  }

  /** A share transfer: Token-2022 runs the axel_v2 hook as a CPI, which emits `events`. */
  hookedTransfer(events: string[]): string[] {
    return [
      `Program ${TOKEN_2022} invoke [1]`,
      'Program log: Instruction: TransferChecked',
      `Program ${this.id} invoke [2]`,
      'Program log: Instruction: Execute',
      ...events.map((event) => `Program data: ${event}`),
      `Program ${this.id} consumed 13343 of 187000 compute units`,
      `Program ${this.id} success`,
      `Program ${TOKEN_2022} consumed 40385 of 200000 compute units`,
      `Program ${TOKEN_2022} success`,
    ];
  }

  /** An instruction that emits `events` and then fails, so the runtime reverts it. */
  failedInstruction(name: string, events: string[]): string[] {
    return [
      `Program ${this.id} invoke [1]`,
      `Program log: Instruction: ${name}`,
      ...events.map((event) => `Program data: ${event}`),
      'Program log: AnchorError occurred. Error Code: InvalidState. Error Number: 6010.',
      `Program ${this.id} consumed 9000 of 200000 compute units`,
      `Program ${this.id} failed: custom program error: 0x177a`,
    ];
  }
}
