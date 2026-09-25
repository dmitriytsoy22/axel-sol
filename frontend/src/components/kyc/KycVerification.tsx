'use client';

import React, { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { CircleCheck, FlaskConical, Loader2, RotateCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConnectWalletPanel } from '@/components/wallet/ConnectWalletPanel';
import { useInvestorOf } from '@/hooks/useInvestor';
import { useKycVerification, type KycFlow } from '@/hooks/useKycVerification';
import { useUnixNow } from '@/hooks/useUnixNow';
import { Link } from '@/i18n/routing';
import { KYC_API_URL, type KycSession } from '@/lib/api/kyc';
import { DEMO_ACCESS_SHOWN } from '@/lib/demo/config';
import { formatDate } from '@/lib/format';
import {
  loadSumsubSdk,
  sumsubProgress,
  type SumsubProgress,
  type SumsubWebSdk,
} from '@/lib/kyc/sumsub';
import type { InvestorAccount } from '@/lib/solana/accounts';
import { eligibility } from '@/lib/solana/eligibility';

/** How often the page reads the wallet's record while Sumsub reviews it. */
const RECORD_POLL_MS = 10_000;

const CONTAINER_ID = 'sumsub-websdk-container';

/** The wallet's record as the reader needs it: can it buy any car, only demo cars, or none. */
type Standing = 'verified' | 'demo' | 'none' | 'expired' | 'revoked' | 'frozen';

function standingOf(investor: InvestorAccount | null, now: number): Standing {
  const anyCar = eligibility(investor, false, now);
  if (anyCar === 'eligible') return 'verified';
  if (anyCar === 'demoNotAllowed') return 'demo';
  if (anyCar === 'unverified') return 'none';
  return anyCar;
}

const STANDING_TONE: Record<Standing, PillTone> = {
  verified: 'success',
  demo: 'info',
  none: 'neutral',
  expired: 'warning',
  revoked: 'danger',
  frozen: 'danger',
};

function RecordCard({
  investor,
  standing,
}: {
  investor: InvestorAccount | null;
  standing: Standing;
}): JSX.Element {
  const t = useTranslations('Kyc');
  const locale = useLocale();
  const until = investor ? formatDate(investor.expiresAt, locale) : '';

  return (
    <section
      aria-labelledby="kyc-record-title"
      className="rounded-card border border-border bg-card p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="kyc-record-title" className="text-title font-semibold text-foreground">
          {t('recordTitle')}
        </h2>
        <Pill tone={STANDING_TONE[standing]}>{t(`standing_${standing}`)}</Pill>
      </div>
      <p className="mt-2 max-w-[60ch] text-body text-muted-foreground">
        {t(`standingBody_${standing}`, {
          date: until,
          provider: investor ? t(`provider_${investor.provider}`) : '',
        })}
      </p>
    </section>
  );
}

/** Sumsub's WebSDK in the page, launched once per session token. */
function SumsubFrame({
  session,
  loadSdk,
  refreshToken,
  report,
}: {
  session: KycSession;
  loadSdk: () => Promise<SumsubWebSdk>;
  refreshToken: () => Promise<string>;
  report: (progress: SumsubProgress | 'sdkUnavailable') => void;
}): JSX.Element {
  const locale = useLocale();
  const callbacks = useRef({ loadSdk, refreshToken, report, locale });
  callbacks.current = { loadSdk, refreshToken, report, locale };

  useEffect(() => {
    let active = true;
    const current = callbacks.current;
    current.loadSdk().then(
      (sdk) => {
        if (!active) return;
        sdk
          .init(session.accessToken, () => callbacks.current.refreshToken())
          .withConf({ lang: current.locale, theme: 'light' })
          .withOptions({ addViewportTag: false, adaptIframeHeight: true })
          .onMessage((type, payload) => {
            const progress = sumsubProgress(type, payload);
            if (progress) callbacks.current.report(progress);
          })
          .build()
          .launch(`#${CONTAINER_ID}`);
      },
      () => {
        if (active) callbacks.current.report('sdkUnavailable');
      },
    );
    return () => {
      active = false;
    };
  }, [session.accessToken]);

  return (
    <div
      id={CONTAINER_ID}
      data-testid="sumsub-websdk"
      className="min-h-[32rem] overflow-hidden rounded-card border border-border bg-card"
    />
  );
}

function VerifyFlow({
  apiUrl,
  loadSdk,
}: {
  apiUrl: string;
  loadSdk: () => Promise<SumsubWebSdk>;
}): JSX.Element {
  const t = useTranslations('Kyc');
  const { flow, start, refreshToken, report } = useKycVerification(apiUrl);
  const busy = flow.step === 'signing' || flow.step === 'opening';

  if (flow.step === 'verifying') {
    return (
      <div className="flex flex-col gap-4">
        <p aria-live="polite" className="max-w-[65ch] text-body text-muted-foreground">
          {t(`progress_${flow.progress ?? 'started'}`)}
        </p>
        <SumsubFrame
          session={flow.session}
          loadSdk={loadSdk}
          refreshToken={refreshToken}
          report={report}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-muted-foreground">
        <li>{t('stepSign')}</li>
        <li>{t('stepSumsub')}</li>
        <li>{t('stepChain')}</li>
      </ol>
      <Button size="lg" onClick={start} disabled={busy} aria-busy={busy}>
        {busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />
        ) : flow.step === 'failed' ? (
          <RotateCw aria-hidden="true" strokeWidth={1.75} />
        ) : (
          <ShieldCheck aria-hidden="true" strokeWidth={1.75} />
        )}
        {busy ? t(flow.step) : t(flow.step === 'failed' ? 'tryAgain' : 'start')}
      </Button>
      {flow.step === 'failed' && <FailureNote flow={flow} />}
    </div>
  );
}

function FailureNote({ flow }: { flow: Extract<KycFlow, { step: 'failed' }> }): JSX.Element {
  const t = useTranslations('Kyc');
  return (
    <p role="alert" className="max-w-[65ch] text-small text-destructive">
      {t(`failure_${flow.failure}`)}
    </p>
  );
}

/** Where a wallet gets DEMO access when this deployment runs no identity check. */
function DemoAccessGuide(): JSX.Element {
  const t = useTranslations('Kyc');
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="max-w-[65ch] text-body text-muted-foreground">
        {t(DEMO_ACCESS_SHOWN ? 'demoHere' : 'demoElsewhere')}
      </p>
      {DEMO_ACCESS_SHOWN && (
        <Link href="/demo" className={buttonClasses({ variant: 'outline', size: 'lg' })}>
          <FlaskConical aria-hidden="true" strokeWidth={1.75} />
          {t('getDemoAccess')}
        </Link>
      )}
    </div>
  );
}

/**
 * The identity check of the connected wallet: its record in the program's KYC registry, and
 * the Sumsub check that writes it when this deployment has the AXEL backend's KYC endpoints
 * (NEXT_PUBLIC_KYC_API_URL); without them, how to get demo access instead.
 */
export function KycVerification({
  apiUrl = KYC_API_URL,
  loadSdk = loadSumsubSdk,
}: {
  apiUrl?: string | null;
  loadSdk?: () => Promise<SumsubWebSdk>;
}): JSX.Element {
  const t = useTranslations('Kyc');
  const { publicKey, connected, connecting } = useWallet();
  const now = useUnixNow();
  const record = useInvestorOf(publicKey, { refreshMs: apiUrl ? RECORD_POLL_MS : undefined });

  let body: React.ReactNode;
  if (!connected && !connecting) {
    body = (
      <ConnectWalletPanel
        title={t('connectTitle')}
        body={t('connectBody')}
        pointsTitle={t('connectPointsTitle')}
        points={[t('connectPoint1'), t('connectPoint2'), t('connectPoint3')]}
      />
    );
  } else if (record.error) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card px-5 py-4">
        <p className="text-body text-muted-foreground">{t('recordError')}</p>
        <Button variant="secondary" size="sm" onClick={record.refetch}>
          <RotateCw aria-hidden="true" strokeWidth={1.75} />
          {t('retry')}
        </Button>
      </div>
    );
  } else if (record.isLoading || connecting) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  } else {
    const standing = standingOf(record.investor, now);
    let action: React.ReactNode;
    if (standing === 'verified') {
      action = (
        <div className="flex flex-col items-start gap-4">
          <p className="inline-flex items-center gap-2 text-body text-foreground">
            <CircleCheck aria-hidden="true" className="h-5 w-5 text-success" strokeWidth={1.75} />
            {t('nothingToDo')}
          </p>
          <Link href="/#vehicles" className={buttonClasses({ variant: 'outline' })}>
            {t('browseCars')}
          </Link>
        </div>
      );
    } else if (standing === 'frozen') {
      action = <p className="max-w-[65ch] text-body text-muted-foreground">{t('frozenNote')}</p>;
    } else if (apiUrl) {
      action = <VerifyFlow apiUrl={apiUrl} loadSdk={loadSdk} />;
    } else {
      action = <DemoAccessGuide />;
    }

    body = (
      <div className="flex flex-col gap-8">
        <RecordCard investor={record.investor} standing={standing} />
        <section
          aria-labelledby="kyc-check-title"
          className="flex flex-col gap-4 rounded-card border border-border bg-card p-6 shadow-sm"
        >
          <h2 id="kyc-check-title" className="text-title font-semibold text-foreground">
            {t(
              apiUrl || standing === 'verified' || standing === 'frozen'
                ? 'checkTitle'
                : 'demoTitle',
            )}
          </h2>
          {action}
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <PageHeader overline={t('overline')} title={t('title')} lead={t('lead')} />
      <div className="lg:max-w-[48rem]">{body}</div>
    </div>
  );
}
