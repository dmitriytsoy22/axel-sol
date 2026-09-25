import type { Project } from '@/types/project';

/** On-chain catalog as read once per page by useProjects and shared by every home section. */
export interface CatalogFeed {
  projects: Project[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}
