import { createHmac } from 'crypto';

import type { SumsubConfig } from '../config/app-config';
import type { FetchFn } from '../kyc/sumsub.client';

export interface FakeApplicant {
  id: string;
  externalUserId: string;
  levelName: string;
  reviewStatus: string;
  reviewAnswer?: 'GREEN' | 'RED';
  country?: string;
}

export interface SumsubRequest {
  method: string;
  path: string;
  body: unknown;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Stands in for the Sumsub REST API at the HTTP boundary. It rejects requests whose
 * `X-App-Access-Sig` is wrong, like the real API, and serves applicants set by the test.
 */
export class FakeSumsub {
  readonly requests: SumsubRequest[] = [];
  readonly applicants = new Map<string, FakeApplicant>();
  /** Status to answer every request with instead of handling it, to simulate an outage. */
  outageStatus: number | null = null;

  constructor(private readonly config: SumsubConfig) {}

  readonly fetch: FetchFn = (input, init) => Promise.resolve(this.handle(input, init));

  private handle(input: Parameters<FetchFn>[0], init: Parameters<FetchFn>[1]): Response {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    const headers = new Headers(init?.headers);
    const path = url.pathname + url.search;

    if (url.origin !== new URL(this.config.baseUrl).origin) {
      return json(404, { description: `unknown host ${url.origin}` });
    }
    const timestamp = headers.get('X-App-Access-Ts') ?? '';
    const expected = createHmac('sha256', this.config.secretKey ?? '')
      .update(timestamp + method + path + body)
      .digest('hex');
    if (
      headers.get('X-App-Token') !== this.config.appToken ||
      headers.get('X-App-Access-Sig') !== expected
    ) {
      return json(401, { description: 'Request signature mismatch' });
    }

    const parsedBody: unknown = body === '' ? null : JSON.parse(body);
    this.requests.push({ method, path, body: parsedBody });
    if (this.outageStatus !== null) {
      return json(this.outageStatus, { description: 'unavailable' });
    }

    if (method === 'POST' && path === '/resources/accessTokens/sdk') {
      const { userId } = parsedBody as { userId: string };
      return json(200, { token: `_act-sbx-${userId}`, userId });
    }
    const applicantMatch = /^\/resources\/applicants\/([^/]+)\/one$/.exec(path);
    if (method === 'GET' && applicantMatch !== null) {
      const applicant = this.applicants.get(decodeURIComponent(applicantMatch[1]));
      if (applicant === undefined) {
        return json(404, { description: 'Applicant not found' });
      }
      return json(200, {
        id: applicant.id,
        externalUserId: applicant.externalUserId,
        info: applicant.country === undefined ? {} : { country: applicant.country },
        review: {
          levelName: applicant.levelName,
          reviewStatus: applicant.reviewStatus,
          ...(applicant.reviewAnswer === undefined
            ? {}
            : { reviewResult: { reviewAnswer: applicant.reviewAnswer } }),
        },
      });
    }
    return json(404, { description: `no route ${method} ${path}` });
  }
}
