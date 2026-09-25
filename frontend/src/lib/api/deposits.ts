import { z } from 'zod';

const Hex32 = z.string().regex(/^[0-9a-f]{64}$/, 'expected 32 bytes of lowercase hex');

/** The `deposit_revenue` arguments that commit to a report (docs/api.md, "Revenue Report: Draft"). */
const DepositParamsSchema = z.object({
  /** u64 base units of the payment mint, as a decimal string. */
  gross: z.string().regex(/^\d+$/, 'expected a decimal u64 string'),
  /** YYYYMMDD. */
  periodStart: z.number().int(),
  periodEnd: z.number().int(),
  reportHash: Hex32,
  kind: z.enum(['regular', 'final']),
});

const DraftSchema = z.object({
  reportHash: Hex32,
  dataOrigin: z.string(),
  /** The rebuilt report, kept exactly as received: its canonical JSON is what `reportHash` hashes. */
  report: z.record(z.string(), z.unknown()),
  depositParams: DepositParamsSchema,
  /** The `RevenuePeriod` the deposit creates; it lands only at this index. */
  periodIndex: z.number().int().nonnegative(),
  /** `Project.operator`: the fee payer and the signature still missing. */
  operator: z.string(),
  /** A v0 `deposit_revenue`, base64, signed by the oracle only. */
  transaction: z.string().min(1),
  lastValidBlockHeight: z.number().int(),
});

export type DepositParams = z.infer<typeof DepositParamsSchema>;
export type DepositDraft = z.infer<typeof DraftSchema>;

/** The backend refused the report; `details` are the differing fields or the missing days. */
export class DepositDraftError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: string[],
  ) {
    super(message);
    this.name = 'DepositDraftError';
  }
}

const ErrorBodySchema = z.object({
  message: z.union([z.string(), z.array(z.string())]),
  differences: z.array(z.string()).optional(),
  missingDays: z.array(z.string()).optional(),
});

/**
 * POST /v2/deposits/draft: the backend rebuilds the operator's monthly report from the car's
 * published telemetry, and answers the deposit that pays it out, co-signed by the car's oracle.
 */
export async function requestDepositDraft(
  baseUrl: string,
  report: Record<string, unknown>,
): Promise<DepositDraft> {
  const response = await fetch(`${baseUrl}/v2/deposits/draft`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
  // A proxy in front of the backend may answer an error page instead of JSON.
  const body: unknown = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) {
    const refusal = ErrorBodySchema.safeParse(body);
    if (!refusal.success) {
      throw new DepositDraftError(response.status, `The backend answered ${response.status}`, []);
    }
    const { message, differences, missingDays } = refusal.data;
    throw new DepositDraftError(
      response.status,
      Array.isArray(message) ? message.join('; ') : message,
      differences ?? missingDays ?? [],
    );
  }
  return DraftSchema.parse(body);
}
