import { sharesValue } from '@/lib/solana/math';
import { sumByToken, type PaymentToken } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';

export interface CatalogStats {
  vehicles: number;
  sharesSold: bigint;
  sharesTotal: bigint;
  /** Shares sold at each car's price, per payment token. */
  soldValue: { amount: bigint; unit: PaymentToken }[];
  /** Revenue deposits across all cars. */
  deposits: number;
}

export function catalogStats(projects: Project[]): CatalogStats {
  return {
    vehicles: projects.length,
    sharesSold: projects.reduce((sum, project) => sum + project.sharesSold, 0n),
    sharesTotal: projects.reduce((sum, project) => sum + project.totalShares, 0n),
    soldValue: sumByToken(
      projects.map((project) => ({
        amount: sharesValue(project.sharesSold, project.pricePerShare),
        token: project.payment,
      })),
    ),
    deposits: projects.reduce((sum, project) => sum + project.periodCount, 0),
  };
}
