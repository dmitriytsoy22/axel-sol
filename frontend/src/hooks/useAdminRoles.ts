'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';
import type { ConfigAccount } from '@/lib/solana/accounts';
import { fetchConfig, fetchProjects } from '@/lib/solana/readers';
import type { Project } from '@/types/project';
import { useChainQuery } from './useChainQuery';

export interface AdminRoles {
  config: ConfigAccount | null;
  /** Every project; the admin manages all of them. */
  projects: Project[];
  /** `Config.admin`: creates, activates, pauses and closes projects. */
  isAdmin: boolean;
  /** `Config.kyc_authority`: writes any KYC record. */
  isKycAuthority: boolean;
  /** `Config.demo_kyc_authority`: grants and revokes DEMO access only. */
  isDemoKycAuthority: boolean;
  /** Projects whose `operator` is the connected wallet. */
  operated: Project[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** What the connected wallet may do, read from the config and each project's roles. */
export function useAdminRoles(): AdminRoles {
  const { publicKey } = useWallet();
  const { data, isLoading, error, refetch } = useChainQuery(
    publicKey ? `roles:${publicKey.toBase58()}` : null,
    async (connection) => {
      const [config, projects] = await Promise.all([
        fetchConfig(connection),
        fetchProjects(connection),
      ]);
      return { config, projects };
    },
  );
  const config = data?.config ?? null;
  const projects = data?.projects ?? [];
  const holds = (role: PublicKey | undefined) => Boolean(publicKey && role?.equals(publicKey));

  return {
    config,
    projects,
    isAdmin: holds(config?.admin),
    isKycAuthority: holds(config?.kycAuthority),
    isDemoKycAuthority: holds(config?.demoKycAuthority),
    operated: publicKey ? projects.filter((project) => project.operator.equals(publicKey)) : [],
    isLoading,
    error,
    refetch,
  };
}
