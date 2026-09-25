import type { IdlField, IdlType } from '@coral-xyz/anchor/dist/cjs/idl';
import { BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

import { createAxelProgram } from '../solana/axel-program';
import rawIdl from '../solana/idl/axel_v2.json';
import { ProgramLogWriter } from '../testing/program-log-writer';
import { EventDecoder, type JsonValue } from './event-decoder';

const programId = Keypair.generate().publicKey;
const program = createAxelProgram(new Connection('http://127.0.0.1:1'), programId);
const decoder = new EventDecoder(program);
const writer = new ProgramLogWriter(programId);

const U64_MAX = new BN('18446744073709551615');
const I64_MIN = new BN('-9223372036854775808');
const U128_MAX = new BN('340282366920938463463374607431768211455');

/** A value at the edge of each IDL type, with the JSON the decoder must turn it into. */
function sample(type: IdlType, seed: number): { value: unknown; json: JsonValue } {
  switch (type) {
    case 'pubkey': {
      const key = Keypair.generate().publicKey;
      return { value: key, json: key.toBase58() };
    }
    case 'bool':
      return { value: true, json: true };
    case 'u8':
      return { value: 255, json: 255 };
    case 'u16':
      return { value: 65_535, json: 65_535 };
    case 'u32':
      return { value: 4_294_967_295, json: 4_294_967_295 };
    case 'u64':
      return { value: U64_MAX, json: '18446744073709551615' };
    case 'i64':
      return { value: I64_MIN, json: '-9223372036854775808' };
    case 'u128':
      return { value: U128_MAX, json: '340282366920938463463374607431768211455' };
  }
  if (typeof type === 'object' && 'array' in type && typeof type.array[1] === 'number') {
    const items = Array.from({ length: type.array[1] }, (_, i) => sample(type.array[0], seed + i));
    if (type.array[0] === 'u8') {
      const bytes = items.map((_, i) => (seed + i) % 256);
      return { value: bytes, json: Buffer.from(bytes).toString('hex') };
    }
    return { value: items.map((item) => item.value), json: items.map((item) => item.json) };
  }
  if (typeof type === 'object' && 'defined' in type) {
    const definition = (program.idl.types ?? []).find((entry) => entry.name === type.defined.name);
    if (definition?.type.kind === 'enum') {
      const variant = definition.type.variants[seed % definition.type.variants.length].name;
      return { value: { [variant]: {} }, json: variant };
    }
  }
  throw new Error(`No sample for ${JSON.stringify(type)}`);
}

describe('EventDecoder', () => {
  it('knows every event of the IDL by the name the program gives it', () => {
    expect(decoder.types).toEqual(rawIdl.events.map((event) => event.name));
    expect(decoder.types).toContain('RevenueDeposited');
  });

  it.each(rawIdl.events.map((event) => event.name))(
    'turns %s into JSON without losing precision',
    (type) => {
      const name = type[0].toLowerCase() + type.slice(1);
      const definition = (program.idl.types ?? []).find((entry) => entry.name === name);
      if (definition?.type.kind !== 'struct') {
        throw new Error(`${name} is not a struct`);
      }
      const value: Record<string, unknown> = {};
      const json: Record<string, JsonValue> = {};
      (definition.type.fields as IdlField[]).forEach((field, index) => {
        const entry = sample(field.type, index * 7 + 3);
        value[field.name] = entry.value;
        json[field.name] = entry.json;
      });

      expect(decoder.decode(writer.event(type, value))).toEqual({ type, data: json });
    },
  );

  it('decodes a revenue deposit into the documented shape', () => {
    const project = new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
    const attestor = new PublicKey('Hq3dxH2P5kLcvjN6dVHZXwrqGbXJ7s8x8W3Byt9tLN5N');
    const logged = writer.event('RevenueDeposited', {
      project,
      index: 2,
      periodStart: 20_260_901,
      periodEnd: 20_260_930,
      gross: new BN('260500000000'),
      fee: new BN('39075000000'),
      net: new BN('221425000000'),
      supply: new BN(100),
      accAfter: new BN('2214250000000000000000'),
      reportHash: Array.from({ length: 32 }, (_, i) => i),
      attestor,
      kind: { final: {} },
    });

    expect(decoder.decode(logged)).toEqual({
      type: 'RevenueDeposited',
      data: {
        project: project.toBase58(),
        index: 2,
        periodStart: 20_260_901,
        periodEnd: 20_260_930,
        gross: '260500000000',
        fee: '39075000000',
        net: '221425000000',
        supply: '100',
        accAfter: '2214250000000000000000',
        reportHash: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
        attestor: attestor.toBase58(),
        kind: 'final',
      },
    });
  });

  it('does not decode a record whose discriminator is not an event of the IDL', () => {
    expect(decoder.decode(Buffer.alloc(40, 7).toString('base64'))).toBeNull();
  });

  describe('does not decode a record that lacks the layout the IDL gives its event', () => {
    const claimed = Buffer.from(
      writer.event('Claimed', {
        project: Keypair.generate().publicKey,
        owner: Keypair.generate().publicKey,
        claimer: Keypair.generate().publicKey,
        amount: new BN(5),
      }),
      'base64',
    );

    it.each([
      ['cut inside a public key', claimed.subarray(0, 20)],
      ['cut inside the amount', claimed.subarray(0, claimed.length - 3)],
      ['followed by extra bytes', Buffer.concat([claimed, Buffer.from([0])])],
    ])('%s', (_case, bytes) => {
      expect(decoder.decode(bytes.toString('base64'))).toBeNull();
    });

    it('while the intact record decodes', () => {
      expect(decoder.decode(claimed.toString('base64'))).toMatchObject({
        type: 'Claimed',
        data: { amount: '5' },
      });
    });
  });
});
