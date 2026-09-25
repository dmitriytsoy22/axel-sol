import type { ProjectState } from '@/types/project';

export interface CatalogStats {
  vehicles: number;
  sharesSold: number;
  sharesTotal: number;
  /** Shares sold valued at each car's current price per share. */
  soldValueLamports: number;
  /** Revenue periods the operators have deposited, across all cars. */
  deposits: number;
}

export function catalogStats(projects: ProjectState[]): CatalogStats {
  return projects.reduce<CatalogStats>(
    (acc, project) => ({
      vehicles: acc.vehicles + 1,
      sharesSold: acc.sharesSold + project.tokensSold,
      sharesTotal: acc.sharesTotal + project.totalTokenSupply,
      soldValueLamports: acc.soldValueLamports + project.tokensSold * project.pricePerToken,
      deposits: acc.deposits + project.periodCount,
    }),
    { vehicles: 0, sharesSold: 0, sharesTotal: 0, soldValueLamports: 0, deposits: 0 },
  );
}
