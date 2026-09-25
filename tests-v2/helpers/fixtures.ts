import { Keypair, PublicKey } from "@solana/web3.js";
import { bn, TestEnv } from "./env";
import { expectOk } from "./assert";
import { initializeConfigIx, type InitializeConfigParams } from "./instructions";

export const DAY = 86_400n;

export interface Roles {
  admin: Keypair;
  kyc: Keypair;
  demoKyc: Keypair;
  treasury: Keypair;
}

export function newRoles(env: TestEnv): Roles {
  return {
    admin: env.newAccount(),
    kyc: env.newAccount(),
    demoKyc: env.newAccount(),
    treasury: env.newAccount(),
  };
}

/** Devnet-style settings: 60 s minimum raise, 7 day activation window, fees below the caps. */
export function configParams(roles: Roles): InitializeConfigParams {
  return {
    admin: roles.admin.publicKey,
    kycAuthority: roles.kyc.publicKey,
    demoKycAuthority: roles.demoKyc.publicKey,
    treasury: roles.treasury.publicKey,
    raiseFeeBps: 250,
    revenueFeeBps: 1_500,
    minRaiseDuration: bn(60),
    maxActivationWindow: bn(7n * DAY),
    allowedPaymentMints: [
      Keypair.generate().publicKey,
      PublicKey.default,
      PublicKey.default,
      PublicKey.default,
    ],
  };
}

/** A fresh environment with the config initialized by the upgrade authority. */
export async function configuredEnv(): Promise<{ env: TestEnv; roles: Roles; params: InitializeConfigParams }> {
  const env = new TestEnv();
  const roles = newRoles(env);
  const params = configParams(roles);
  expectOk(env.send([await initializeConfigIx(env.upgradeAuthority.publicKey, params)], [env.upgradeAuthority]));
  return { env, roles, params };
}
