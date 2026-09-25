import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'crypto';

import { CLOCK, type Clock } from '../common/clock';
import { isRecord } from '../common/json';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

export const HTTP_FETCH = Symbol('HTTP_FETCH');
export type FetchFn = typeof fetch;

export interface SumsubAccessToken {
  token: string;
  userId: string;
}

/** The fields of a Sumsub applicant that the backend relies on. */
export interface SumsubApplicant {
  id: string;
  externalUserId: string | null;
  /** ISO 3166-1 alpha-3 country from the verified documents, or else from the applicant's own data. */
  country: string | null;
  levelName: string | null;
  reviewStatus: string | null;
  reviewAnswer: string | null;
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nested(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

/**
 * Minimal Sumsub REST client. Requests are signed as Sumsub requires:
 * `X-App-Access-Sig = hex(HMAC-SHA256(secret, ts + METHOD + path + body))`.
 */
@Injectable()
export class SumsubClient {
  private readonly logger = new Logger(SumsubClient.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(HTTP_FETCH) private readonly fetchFn: FetchFn,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  isConfigured(): boolean {
    const { appToken, secretKey } = this.config.kyc.sumsub;
    return appToken !== null && secretKey !== null;
  }

  /** Access token for the Sumsub WebSDK, for the applicant identified by `userId`. */
  async createAccessToken(
    userId: string,
    levelName: string,
    ttlSeconds: number,
  ): Promise<SumsubAccessToken> {
    const body = await this.request('POST', '/resources/accessTokens/sdk', {
      userId,
      levelName,
      ttlInSecs: ttlSeconds,
    });
    const token = stringField(body, 'token');
    if (token === null) {
      this.logger.error('Sumsub returned no access token');
      throw new BadGatewayException('Sumsub request failed');
    }
    return { token, userId: stringField(body, 'userId') ?? userId };
  }

  async getApplicant(applicantId: string): Promise<SumsubApplicant> {
    const body = await this.request(
      'GET',
      `/resources/applicants/${encodeURIComponent(applicantId)}/one`,
    );
    const id = stringField(body, 'id');
    if (id === null) {
      this.logger.error(`Sumsub returned applicant ${applicantId} without an id`);
      throw new BadGatewayException('Sumsub request failed');
    }
    const review = nested(body, 'review');
    return {
      id,
      externalUserId: stringField(body, 'externalUserId'),
      country:
        stringField(nested(body, 'info'), 'country') ??
        stringField(nested(body, 'fixedInfo'), 'country'),
      levelName: stringField(review, 'levelName'),
      reviewStatus: stringField(review, 'reviewStatus'),
      reviewAnswer: stringField(nested(review, 'reviewResult'), 'reviewAnswer'),
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    payload?: object,
  ): Promise<Record<string, unknown>> {
    const { appToken, secretKey, baseUrl } = this.config.kyc.sumsub;
    if (appToken === null || secretKey === null) {
      throw new ServiceUnavailableException('Sumsub API credentials are not configured');
    }
    const body = payload === undefined ? '' : JSON.stringify(payload);
    const timestamp = Math.floor(this.clock.now() / 1000).toString();
    const signature = createHmac('sha256', secretKey)
      .update(timestamp + method + path + body)
      .digest('hex');

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-App-Token': appToken,
      'X-App-Access-Ts': timestamp,
      'X-App-Access-Sig': signature,
    };
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.fetchFn(`${baseUrl}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const text = await response.text();
      this.logger.error(
        `Sumsub ${method} ${path} answered ${response.status}: ${text.slice(0, 500)}`,
      );
      throw new BadGatewayException('Sumsub request failed');
    }
    const json: unknown = await response.json();
    if (!isRecord(json)) {
      this.logger.error(`Sumsub ${method} ${path} returned a body that is not a JSON object`);
      throw new BadGatewayException('Sumsub request failed');
    }
    return json;
  }
}
