import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUMSUB_SDK_URL, sumsubProgress, type SumsubWebSdk } from '../sumsub';

const scripts = () =>
  Array.from(document.head.querySelectorAll<HTMLScriptElement>('script')).filter(
    (script) => script.src === SUMSUB_SDK_URL,
  );

describe('loadSumsubSdk', () => {
  // The loader keeps its promise for the page's lifetime; each test gets a new page's module.
  let loadSumsubSdk: () => Promise<SumsubWebSdk>;
  beforeEach(async () => {
    vi.resetModules();
    ({ loadSumsubSdk } = await import('../sumsub'));
  });

  afterEach(() => {
    scripts().forEach((script) => script.remove());
    delete window.snsWebSdk;
  });

  it("adds Sumsub's script once and resolves to the SDK it defines", async () => {
    const sdk: SumsubWebSdk = {
      init: () => {
        throw new Error('Not launched in this test');
      },
    };
    const first = loadSumsubSdk();
    const second = loadSumsubSdk();
    expect(scripts()).toHaveLength(1);

    window.snsWebSdk = sdk;
    scripts()[0].dispatchEvent(new Event('load'));

    await expect(first).resolves.toBe(sdk);
    await expect(second).resolves.toBe(sdk);
  });

  it('fails when the script cannot load, and tries again on the next call', async () => {
    const failed = loadSumsubSdk();
    scripts()[0].dispatchEvent(new Event('error'));

    await expect(failed).rejects.toThrow(`Couldn't load ${SUMSUB_SDK_URL}`);
    expect(scripts()).toHaveLength(0);
    void loadSumsubSdk();
    expect(scripts()).toHaveLength(1);
  });
});

describe('sumsubProgress', () => {
  it.each([
    ['idCheck.onApplicantSubmitted', {}, 'submitted'],
    ['idCheck.onApplicantStatusChanged', { reviewStatus: 'pending' }, 'submitted'],
    [
      'idCheck.onApplicantStatusChanged',
      { reviewStatus: 'completed', reviewResult: { reviewAnswer: 'GREEN' } },
      'approved',
    ],
    [
      'idCheck.onApplicantStatusChanged',
      { reviewStatus: 'completed', reviewResult: { reviewAnswer: 'RED' } },
      'rejected',
    ],
    ['idCheck.onApplicantStatusChanged', { reviewStatus: 'init' }, null],
    ['idCheck.onApplicantStatusChanged', 'not an object', null],
    ['idCheck.onStepCompleted', { idDocSetType: 'IDENTITY' }, null],
  ])('reads %s %j as %s', (type, payload, expected) => {
    expect(sumsubProgress(type, payload)).toBe(expected);
  });
});
