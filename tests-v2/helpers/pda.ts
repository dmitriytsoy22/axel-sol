import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./env";

function find(...seeds: Array<Buffer | PublicKey>): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => (seed instanceof PublicKey ? seed.toBuffer() : seed)),
    PROGRAM_ID,
  );
}

export function configAddress(): [PublicKey, number] {
  return find(Buffer.from("config"));
}

export function investorAddress(wallet: PublicKey): [PublicKey, number] {
  return find(Buffer.from("investor"), wallet);
}

export function projectAddress(shareMint: PublicKey): [PublicKey, number] {
  return find(Buffer.from("project"), shareMint);
}

export function positionAddress(project: PublicKey, owner: PublicKey): [PublicKey, number] {
  return find(Buffer.from("position"), project, owner);
}

export function escrowAddress(project: PublicKey): [PublicKey, number] {
  return find(Buffer.from("escrow"), project);
}

export function revenueAddress(project: PublicKey): [PublicKey, number] {
  return find(Buffer.from("revenue"), project);
}

export function extraAccountMetasAddress(shareMint: PublicKey): [PublicKey, number] {
  return find(Buffer.from("extra-account-metas"), shareMint);
}

export function configPda(): PublicKey {
  return configAddress()[0];
}

export function investorPda(wallet: PublicKey): PublicKey {
  return investorAddress(wallet)[0];
}

export function projectPda(shareMint: PublicKey): PublicKey {
  return projectAddress(shareMint)[0];
}

export function positionPda(project: PublicKey, owner: PublicKey): PublicKey {
  return positionAddress(project, owner)[0];
}
