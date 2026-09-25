import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Program, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  address,
  createNoopSigner,
  isSignerRole,
  isWritableRole,
  type Address,
  type Decoder,
  type Encoder,
  type Instruction,
} from "@solana/kit";
import BN from "bn.js";
import idlJson from "../../../frontend/src/lib/solana/idl-v2/axel_v2.json" with { type: "json" };
import * as sdk from "../src";

/**
 * The generated client against Anchor's own coder for the same IDL, which the program's
 * test suite uses on LiteSVM. Every instruction, account, defined type, error and PDA is
 * compared byte for byte, so a client that drifts from the IDL fails here.
 */
type IdlInstruction = Idl["instructions"][number];
type IdlType = IdlInstruction["args"][number]["type"];
type IdlTypeDef = NonNullable<Idl["types"]>[number];

const program = new Program(idlJson as Idl, { connection: new Connection("http://127.0.0.1:8899") });
const idl = program.idl;

const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

function pascal(name: string): string {
  return name[0].toUpperCase() + name.slice(1);
}

function screamingSnake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/** A generated export looked up by name; the lookup fails the test if the SDK lacks it. */
function sdkExport<T>(name: string): T {
  const value: unknown = Reflect.get(sdk, name);
  assert.notEqual(value, undefined, `the SDK does not export ${name}`);
  return value as T;
}

function definedType(name: string): IdlTypeDef {
  const found = idl.types?.find((type) => type.name === name);
  assert.ok(found, `the IDL has no type ${name}`);
  return found;
}

function definedName(type: IdlType): string | undefined {
  return typeof type === "object" && "defined" in type ? type.defined.name : undefined;
}

/**
 * A value of `type` in Anchor's representation. `seed` varies the values; integers sit near
 * the top of their range and strings are not ASCII, to catch width and length-prefix errors.
 */
function sample(type: IdlType, seed: number): unknown {
  switch (type) {
    case "bool":
      return seed % 2 === 0;
    case "u8":
      return 200 + (seed % 50);
    case "u16":
      return 60_000 + seed;
    case "u32":
      return 4_000_000_000 + seed;
    case "i64":
      return new BN(-9_000_000_000 - seed);
    case "u64":
      return new BN(2).pow(new BN(63)).addn(seed);
    case "u128":
      return new BN(2).pow(new BN(100)).addn(seed);
    case "string":
      return `Алматы-${seed}`;
    case "pubkey":
      return Keypair.generate().publicKey;
  }
  if (typeof type !== "object") {
    throw new Error(`no sample for IDL type ${JSON.stringify(type)}`);
  }
  if ("option" in type) {
    return seed % 2 === 0 ? null : sample(type.option, seed + 1);
  }
  if ("vec" in type) {
    return [sample(type.vec, seed + 1), sample(type.vec, seed + 2)];
  }
  if ("array" in type) {
    const [inner, length] = type.array;
    assert.equal(typeof length, "number");
    return Array.from({ length: length as number }, (_, i) =>
      inner === "u8" ? (seed + i) % 256 : sample(inner, seed + i),
    );
  }
  const def = definedType(definedName(type) ?? "");
  if (def.type.kind === "struct") {
    const fields = def.type.fields ?? [];
    return Object.fromEntries(
      fields.map((field, i) => {
        assert.ok(typeof field === "object" && "name" in field, `${def.name} has tuple fields`);
        return [field.name, sample(field.type, seed + i + 1)];
      }),
    );
  }
  assert.equal(def.type.kind, "enum", `${def.name} is neither a struct nor an enum`);
  const variants = def.type.kind === "enum" ? def.type.variants : [];
  const variant = variants[seed % variants.length];
  assert.equal(variant.fields, undefined, `${def.name}::${variant.name} carries data`);
  return { [variant.name]: {} };
}

/** The same value in the representation of the generated client (@solana/kit). */
function toKit(value: unknown, type: IdlType): unknown {
  switch (type) {
    case "u64":
    case "i64":
    case "u128":
      return BigInt((value as BN).toString());
    case "pubkey":
      return address((value as PublicKey).toBase58());
    case "bool":
    case "u8":
    case "u16":
    case "u32":
    case "string":
      return value;
  }
  if (typeof type !== "object") {
    throw new Error(`no conversion for IDL type ${JSON.stringify(type)}`);
  }
  if ("option" in type) {
    return value === null ? null : toKit(value, type.option);
  }
  if ("vec" in type) {
    return (value as unknown[]).map((item) => toKit(item, type.vec));
  }
  if ("array" in type) {
    const [inner] = type.array;
    return inner === "u8" ? Uint8Array.from(value as number[]) : (value as unknown[]).map((item) => toKit(item, inner));
  }
  const def = definedType(definedName(type) ?? "");
  if (def.type.kind === "struct") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      (def.type.fields ?? []).map((field) => {
        assert.ok(typeof field === "object" && "name" in field);
        return [field.name, toKit(record[field.name], field.type)];
      }),
    );
  }
  const variantName = Object.keys(value as object)[0];
  return def.type.kind === "enum" ? def.type.variants.findIndex((variant) => variant.name === variantName) : undefined;
}

/**
 * The generated builders take struct arguments flattened into the input, next to the
 * accounts; Anchor takes them positionally.
 */
function kitArguments(instruction: IdlInstruction, args: unknown[]): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  instruction.args.forEach((arg, i) => {
    const name = definedName(arg.type);
    const def = name === undefined ? undefined : definedType(name);
    if (def?.type.kind === "struct") {
      Object.assign(input, toKit(args[i], arg.type));
    } else {
      input[arg.name] = toKit(args[i], arg.type);
    }
  });
  return input;
}

function metas(instruction: Instruction): Array<[string, boolean, boolean]> {
  return (instruction.accounts ?? []).map((meta) => [meta.address, isSignerRole(meta.role), isWritableRole(meta.role)]);
}

describe("instructions", () => {
  test("the client covers every instruction of the IDL and the program address", () => {
    assert.equal(sdk.AXEL_V2_PROGRAM_ADDRESS, idl.address);
    assert.equal(idl.instructions.length, 24);
  });

  idl.instructions.forEach((instruction, index) => {
    test(`${instruction.name} encodes the same data and accounts as Anchor`, async () => {
      const args = instruction.args.map((arg, i) => sample(arg.type, index * 100 + i * 10));
      const keys = new Map(instruction.accounts.map((account) => [account.name, Keypair.generate().publicKey]));
      const kitAccounts = Object.fromEntries(
        instruction.accounts.map((account) => {
          assert.ok(!("accounts" in account), `${instruction.name}.${account.name} is a composite account`);
          const key = address(keys.get(account.name)!.toBase58());
          return [account.name, account.signer === true ? createNoopSigner(key) : key];
        }),
      );

      const expected = await program.methods[instruction.name](...args)
        .accountsStrict(Object.fromEntries(keys))
        .instruction();
      const build = sdkExport<(input: object) => Instruction>(`get${pascal(instruction.name)}Instruction`);
      const actual = build({ ...kitAccounts, ...kitArguments(instruction, args) });

      assert.equal(actual.programAddress, idl.address);
      assert.deepEqual(Buffer.from(actual.data ?? []), expected.data);
      assert.deepEqual(
        metas(actual),
        expected.keys.map((key) => [key.pubkey.toBase58(), key.isSigner, key.isWritable]),
      );
    });
  });
});

describe("accounts and types", () => {
  (idl.accounts ?? []).forEach((account, index) => {
    test(`${account.name} decodes what Anchor encodes`, async () => {
      const type: IdlType = { defined: { name: account.name } };
      const value = sample(type, index * 7);
      const encoded = await program.coder.accounts.encode(account.name, value);
      const decoder = sdkExport<() => Decoder<unknown>>(`get${pascal(account.name)}Decoder`);

      const decoded = decoder().decode(Uint8Array.from(encoded)) as Record<string, unknown>;

      assert.deepEqual(decoded, { discriminator: Uint8Array.from(account.discriminator), ...(toKit(value, type) as object) });
    });
  });

  // Accounts are covered above, with their discriminator. Struct arguments are flattened into
  // the instruction builders and covered by the instruction tests.
  const accountNames = new Set((idl.accounts ?? []).map((account) => account.name));
  const argumentStructs = new Set(idl.instructions.flatMap((instruction) => instruction.args.map((arg) => definedName(arg.type))));
  const standaloneTypes = (idl.types ?? []).filter((def) => !accountNames.has(def.name) && !argumentStructs.has(def.name));

  test("23 events, 4 enums and 2 nested structs are compared as standalone types", () => {
    assert.equal((idl.events ?? []).length, 23);
    assert.equal(standaloneTypes.length, 23 + 4 + 2);
  });

  standaloneTypes.forEach((def, index) => {
    test(`${def.name} encodes like Anchor`, () => {
      const type: IdlType = { defined: { name: def.name } };
      const value = sample(type, index * 13);
      const encoder = sdkExport<() => Encoder<unknown>>(`get${pascal(def.name)}Encoder`);

      assert.deepEqual(Buffer.from(encoder().encode(toKit(value, type))), program.coder.types.encode(def.name, value));
    });
  });
});

describe("errors", () => {
  test("every program error has its code and message in the client", () => {
    assert.ok((idl.errors ?? []).length > 0);
    for (const error of idl.errors ?? []) {
      const constant = `AXEL_V2_ERROR__${screamingSnake(error.name)}`;
      assert.equal(sdkExport<number>(constant), error.code, constant);
      assert.equal(sdk.getAxelV2ErrorMessage(error.code as sdk.AxelV2Error), error.msg, error.name);
    }
  });
});

describe("PDAs", () => {
  const seed = (name: string): Buffer => {
    const constant = idl.constants?.find((c) => c.name === name);
    assert.ok(constant, `the IDL has no constant ${name}`);
    return Buffer.from(JSON.parse(constant.value) as number[]);
  };
  const derive = (...seeds: Array<Buffer | PublicKey>): Address =>
    address(
      PublicKey.findProgramAddressSync(
        seeds.map((part) => (part instanceof PublicKey ? part.toBuffer() : part)),
        new PublicKey(idl.address),
      )[0].toBase58(),
    );
  const kit = (key: PublicKey): Address => address(key.toBase58());
  const [wallet, shareMint, project, owner] = Array.from({ length: 4 }, () => Keypair.generate().publicKey);
  const index = Buffer.alloc(4);
  index.writeUInt32LE(7);

  const cases: Array<[string, () => Promise<readonly [Address, number]>, Address]> = [
    ["config", () => sdk.findConfigPda(), derive(seed("configSeed"))],
    ["investor", () => sdk.findInvestorPda({ wallet: kit(wallet) }), derive(seed("investorSeed"), wallet)],
    ["project", () => sdk.findProjectPda({ shareMint: kit(shareMint) }), derive(seed("projectSeed"), shareMint)],
    [
      "position",
      () => sdk.findPositionPda({ project: kit(project), owner: kit(owner) }),
      derive(seed("positionSeed"), project, owner),
    ],
    [
      "revenue period",
      () => sdk.findRevenuePeriodPda({ project: kit(project), index: 7 }),
      derive(seed("periodSeed"), project, index),
    ],
    ["escrow vault", () => sdk.findEscrowVaultPda({ project: kit(project) }), derive(seed("escrowSeed"), project)],
    ["revenue vault", () => sdk.findRevenueVaultPda({ project: kit(project) }), derive(seed("revenueSeed"), project)],
    [
      "recovery request",
      () => sdk.findRecoveryRequestPda({ project: kit(project), fromOwner: kit(owner) }),
      derive(seed("recoverySeed"), project, owner),
    ],
    [
      "extra account metas",
      () => sdk.findExtraAccountMetasPda({ shareMint: kit(shareMint) }),
      derive(seed("extraAccountMetasSeed"), shareMint),
    ],
  ];

  for (const [name, find, expected] of cases) {
    test(`the ${name} PDA is derived from the program's seeds`, async () => {
      const [actual] = await find();
      assert.equal(actual, expected);
    });
  }

  test("execute_recovery needs only the project, the mint and both wallets", async () => {
    const [fromOwner, toOwner, proposer, executor] = Array.from({ length: 4 }, () => Keypair.generate().publicKey);
    const projectAddress = derive(seed("projectSeed"), shareMint);
    const projectKey = new PublicKey(projectAddress);
    const shareAccount = (wallet: PublicKey): Address =>
      address(
        PublicKey.findProgramAddressSync(
          [wallet.toBuffer(), TOKEN_2022_PROGRAM.toBuffer(), shareMint.toBuffer()],
          ASSOCIATED_TOKEN_PROGRAM,
        )[0].toBase58(),
      );

    const instruction = await sdk.getExecuteRecoveryInstructionAsync({
      executor: createNoopSigner(kit(executor)),
      project: projectAddress,
      proposer: kit(proposer),
      shareMint: kit(shareMint),
      fromOwner: kit(fromOwner),
      toOwner: kit(toOwner),
    });

    assert.deepEqual(
      instruction.accounts.map((meta) => meta.address),
      [
        kit(executor),
        derive(seed("configSeed")),
        projectAddress,
        derive(seed("recoverySeed"), projectKey, fromOwner),
        kit(proposer),
        kit(shareMint),
        kit(fromOwner),
        derive(seed("investorSeed"), fromOwner),
        derive(seed("positionSeed"), projectKey, fromOwner),
        shareAccount(fromOwner),
        kit(toOwner),
        derive(seed("investorSeed"), toOwner),
        derive(seed("positionSeed"), projectKey, toOwner),
        shareAccount(toOwner),
        kit(TOKEN_2022_PROGRAM),
        kit(ASSOCIATED_TOKEN_PROGRAM),
        address("11111111111111111111111111111111"),
      ],
    );
  });

  test("set_investor derives the KYC record from the wallet argument", async () => {
    const authority = Keypair.generate().publicKey;

    const instruction = await sdk.getSetInvestorInstructionAsync({
      authority: createNoopSigner(kit(authority)),
      wallet: kit(wallet),
      status: sdk.InvestorStatus.Active,
      expiresAt: 1_800_000_000n,
      jurisdiction: 398,
      flags: 0,
      provider: sdk.KycProvider.Sumsub,
    });

    assert.equal(instruction.accounts[2].address, derive(seed("investorSeed"), wallet));
  });
});
