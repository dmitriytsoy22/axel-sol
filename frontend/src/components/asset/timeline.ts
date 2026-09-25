import type { ProjectAccount } from '@/lib/solana/accounts';

/** A milestone of a car's project, in the order of the program's state machine. */
export type StepKey = 'opened' | 'funding' | 'activation' | 'operating' | 'closed' | 'refunds';

/** `missed` is a milestone the project will never reach: its raise failed before it. */
export type StepState = 'done' | 'current' | 'upcoming' | 'missed';

export interface TimelineStep {
  key: StepKey;
  state: StepState;
  /** When it happened, in chain seconds; null when the program does not record it. */
  at: number | null;
  /** The deadline of a current or upcoming step. */
  due: number | null;
}

type TimelineFields = Pick<
  ProjectAccount,
  | 'status'
  | 'createdAt'
  | 'raiseDeadline'
  | 'activationWindow'
  | 'activationDeadline'
  | 'activatedAt'
  | 'closedAt'
>;

/**
 * When the raise was funded. The program stores no such time, but it sets the activation
 * deadline to the funding moment plus the activation window, so the difference is exact.
 */
export function fundedAt(project: TimelineFields): number | null {
  return project.activationDeadline > 0
    ? project.activationDeadline - project.activationWindow
    : null;
}

/** Every milestone of the project, with what is done, what is next and what was missed. */
export function timelineOf(project: TimelineFields): TimelineStep[] {
  const funded = fundedAt(project);
  const opened: TimelineStep = { key: 'opened', state: 'done', at: project.createdAt, due: null };
  const step = (
    key: StepKey,
    state: StepState,
    at: number | null = null,
    due: number | null = null,
  ) => ({
    key,
    state,
    at,
    due,
  });

  switch (project.status) {
    case 'fundraising':
      return [
        opened,
        step('funding', 'current', null, project.raiseDeadline),
        step('activation', 'upcoming'),
        step('operating', 'upcoming'),
      ];
    case 'funded':
      return [
        opened,
        step('funding', 'done', funded),
        step('activation', 'current', null, project.activationDeadline),
        step('operating', 'upcoming'),
      ];
    case 'operating':
    case 'paused':
      return [
        opened,
        step('funding', 'done', funded),
        step('activation', 'done', project.activatedAt),
        step('operating', 'current', project.activatedAt),
      ];
    case 'closed':
      return [
        opened,
        step('funding', 'done', funded),
        step('activation', 'done', project.activatedAt),
        step('operating', 'done', project.activatedAt),
        step('closed', 'done', project.closedAt),
      ];
    case 'failed':
      // A raise that was funded failed at activation; any other failed at funding.
      return funded === null
        ? [opened, step('funding', 'missed'), step('refunds', 'current')]
        : [
            opened,
            step('funding', 'done', funded),
            step('activation', 'missed'),
            step('refunds', 'current'),
          ];
  }
}
