import { describe, expect, it } from 'vitest';
import type { ProjectStatus } from '@/lib/solana/accounts';
import { fundedAt, timelineOf } from '../timeline';

const DAY = 86_400;
const project = {
  status: 'fundraising' as ProjectStatus,
  createdAt: 1_790_000_000,
  raiseDeadline: 1_790_000_000 + 30 * DAY,
  activationWindow: 60 * DAY,
  activationDeadline: 0,
  activatedAt: 0,
  closedAt: 0,
};
const FUNDED = project.createdAt + 20 * DAY;
const funded = { ...project, activationDeadline: FUNDED + 60 * DAY };
const running = { ...funded, activatedAt: FUNDED + 5 * DAY };

const summary = (steps: ReturnType<typeof timelineOf>) =>
  steps.map(({ key, state, at, due }) => [key, state, at, due]);

describe('fundedAt', () => {
  it('is the activation deadline minus the activation window, since finalize sets one from the other', () => {
    expect(fundedAt(funded)).toBe(FUNDED);
    expect(fundedAt(project)).toBeNull();
  });
});

describe('timelineOf', () => {
  it('shows an open raise with its deadline and the steps after it', () => {
    expect(summary(timelineOf(project))).toEqual([
      ['opened', 'done', project.createdAt, null],
      ['funding', 'current', null, project.raiseDeadline],
      ['activation', 'upcoming', null, null],
      ['operating', 'upcoming', null, null],
    ]);
  });

  it('shows a funded raise waiting for the car purchase until its activation deadline', () => {
    expect(summary(timelineOf({ ...funded, status: 'funded' })).slice(1, 3)).toEqual([
      ['funding', 'done', FUNDED, null],
      ['activation', 'current', null, funded.activationDeadline],
    ]);
  });

  it('dates every step of a closed car', () => {
    const closed = { ...running, status: 'closed' as const, closedAt: FUNDED + 400 * DAY };

    expect(summary(timelineOf(closed))).toEqual([
      ['opened', 'done', project.createdAt, null],
      ['funding', 'done', FUNDED, null],
      ['activation', 'done', running.activatedAt, null],
      ['operating', 'done', running.activatedAt, null],
      ['closed', 'done', closed.closedAt, null],
    ]);
  });

  it('keeps a paused car on its operating step', () => {
    expect(timelineOf({ ...running, status: 'paused' }).at(-1)).toEqual({
      key: 'operating',
      state: 'current',
      at: running.activatedAt,
      due: null,
    });
  });

  it('marks where a failed raise stopped: at funding, or at activation once funded', () => {
    expect(summary(timelineOf({ ...project, status: 'failed' }))).toEqual([
      ['opened', 'done', project.createdAt, null],
      ['funding', 'missed', null, null],
      ['refunds', 'current', null, null],
    ]);
    expect(summary(timelineOf({ ...funded, status: 'failed' })).slice(1)).toEqual([
      ['funding', 'done', FUNDED, null],
      ['activation', 'missed', null, null],
      ['refunds', 'current', null, null],
    ]);
  });
});
