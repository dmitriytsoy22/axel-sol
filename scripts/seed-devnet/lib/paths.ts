import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `scripts/seed-devnet`. */
export const SEED_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(SEED_DIR, "..", "..");
/** State files, address files and reports; local runs are git-ignored. */
export const OUT_DIR = join(SEED_DIR, "out");
