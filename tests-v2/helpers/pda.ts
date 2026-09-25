import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./env";

export function configAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
}

export function investorAddress(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("investor"), wallet.toBuffer()], PROGRAM_ID);
}

export function configPda(): PublicKey {
  return configAddress()[0];
}

export function investorPda(wallet: PublicKey): PublicKey {
  return investorAddress(wallet)[0];
}
