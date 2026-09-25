import type { ProjectState } from '@/types/project';

/** On-chain catalog as read once per page by useProjectState and shared by every home section. */
export interface CatalogFeed {
  projects: ProjectState[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}
