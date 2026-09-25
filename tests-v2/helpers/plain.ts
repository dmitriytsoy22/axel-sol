import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

/** Converts decoded accounts and events (PublicKey, BN) into values `deepEqual` compares exactly. */
export function plain(value: unknown): Plain {
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  if (BN.isBN(value)) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(plain);
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plain(entry)]));
  }
  throw new Error(`cannot compare a value of type ${typeof value}`);
}
