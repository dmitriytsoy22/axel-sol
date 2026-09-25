'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowRight, ArrowUpRight, Check, Loader2, RotateCw } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useClaim } from '@/hooks/useClaim';
import { useDemoAccess, type DemoAccess } from '@/hooks/useDemoAccess';
import { useInvestor } from '@/hooks/useInvestor';
import { usePaymentBalance } from '@/hooks/usePaymentBalance';
import { usePositions } from '@/hooks/usePositions';
import { useProjects } from '@/hooks/useProjects';
import { useUnixNow } from '@/hooks/useUnixNow';
import type { DemoApi } from '@/lib/demo/client';
import { TURNSTILE_SITE_KEY } from '@/lib/demo/config';
import { formatCount, formatDate, formatTokenAmount } from '@/lib/format';
import { NETWORK_NAME } from '@/lib/network';
import { eligibility } from '@/lib/solana/eligibility';
import { getExplorerUrl } from '@/lib/solana/connection';
import { carTitle } from '@/lib/solana/tokens';
import type { Project } from '@/types/project';
import { saleStateOf } from '@/components/asset/saleState';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConnectWalletPanel } from '@/components/wallet/ConnectWalletPanel';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { demoProgress, type DemoStep, type StepState } from './progress';
import { Turnstile } from './Turnstile';

const linkClasses =
  'inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline';

function TxLink({ signature }: { signature: string | undefined }): JSX.Element | null {
  const t = useTranslations('DemoAccess');
  if (!signature) return null;
  return (
    <a
      href={getExplorerUrl(signature, 'tx')}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClasses}
    >
      {t('viewTransaction')}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      <span className="sr-only">{t('opensInNewTab')}</span>
    </a>
  );
}

function Step({
  index,
  step,
  state,
  title,
  body,
  children,
}: {
  index: number;
  step: DemoStep;
  state: StepState;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}): JSX.Element {
  const t = useTranslations('DemoAccess');
  return (
    <li
      data-step={step}
      data-state={state}
      aria-current={state === 'current' ? 'step' : undefined}
      className={`grid grid-cols-[2.5rem_1fr] gap-x-4 rounded-card border bg-card p-5 md:p-6 ${
        state === 'current' ? 'border-primary shadow-sm' : 'border-border'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 items-center justify-center rounded-full text-small font-semibold tabular-nums ${
          state === 'done'
            ? 'bg-success text-primary-foreground'
            : state === 'current'
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground'
        }`}
      >
        {state === 'done' ? <Check className="h-5 w-5" strokeWidth={1.75} /> : index}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-title font-semibold text-foreground">{title}</h3>
          {state === 'done' && <Pill tone="success">{t('done')}</Pill>}
        </div>
        <div className="mt-1 max-w-[62ch] text-body text-muted-foreground">{body}</div>
        {children && <div className="mt-4 flex flex-col items-start gap-3">{children}</div>}
      </div>
    </li>
  );
}

function StepError({ message }: { message: string | undefined }): JSX.Element | null {
  if (!message) return null;
  return (
    <p role="alert" className="text-small text-destructive">
      {message}
    </p>
  );
}

function Spinner({ on }: { on: boolean }): JSX.Element | null {
  return on ? <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} /> : null;
}

function OpenRaises({ raises }: { raises: Project[] }): JSX.Element {
  const t = useTranslations('DemoAccess');
  const locale = useLocale();
  if (raises.length === 0)
    return <p className="text-small text-muted-foreground">{t('noRaise')}</p>;
  return (
    <ul className="flex w-full flex-col divide-y divide-border rounded-card border border-border">
      {raises.map((project) => (
        <li
          key={project.address.toBase58()}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2"
        >
          <span className="text-small text-foreground">
            {carTitle(project.car)}{' '}
            <span className="text-muted-foreground">
              {t('raiseSold', {
                sold: formatCount(project.sharesSold, locale),
                total: formatCount(project.totalShares, locale),
              })}
            </span>
          </span>
          <Link href={`/assets/${project.shareMint.toBase58()}`} className={linkClasses}>
            {t('openRaise')}
            <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Walkthrough({ demo }: { demo: DemoAccess }): JSX.Element {
  const t = useTranslations('DemoAccess');
  const tErrors = useTranslations('DemoErrors');
  const locale = useLocale();
  const now = useUnixNow(5_000);
  const kyc = useInvestor();
  const { projects, refetch: refetchProjects } = useProjects();
  const { holdings, refetch: refetchPositions } = usePositions();
  const { claim, status: claimStatus } = useClaim();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileRound, setTurnstileRound] = useState(0);
  const [turnstileFailed, setTurnstileFailed] = useState(false);

  const status = demo.status!;
  const fleetMint = status.fleet?.mint ?? null;
  const fleet = projects.find((project) => project.shareMint.toBase58() === fleetMint) ?? null;
  const fleetHolding =
    holdings.find((holding) => holding.project.shareMint.toBase58() === fleetMint) ?? null;
  const raises = projects.filter(
    (project) => project.allowsDemo && saleStateOf(project, now) === 'open',
  );
  const verified = eligibility(kyc.investor, true, now) === 'eligible';
  const progress = demoProgress({
    verified,
    boughtInRaise: holdings.some(({ position }) => position.paidIn > 0n),
    fleetShares: fleetHolding?.position.shares ?? 0n,
    fleetPending: fleetHolding?.pending ?? 0n,
    fleetClaimed: fleetHolding?.position.totalClaimed ?? 0n,
  });
  const needsTurnstile = status.turnstile && !demo.session;
  const sharesPerWallet = status.fleet ? BigInt(status.fleet.sharesPerWallet) : 0n;
  const cooldown = status.fleet?.cooldownSeconds ?? null;
  const fleetName = fleet ? carTitle(fleet.car) : t('fleetCar');
  const amount = (value: bigint) => (fleet ? formatTokenAmount(value, fleet.payment, locale) : '—');

  const [chainVersion, setChainVersion] = useState(0);
  const refreshChain = () => {
    setChainVersion((version) => version + 1);
    kyc.refetch();
    refetchPositions();
    refetchProjects();
  };

  const access = async () => {
    const ok = await demo.getAccess(turnstileToken);
    setTurnstileToken(null);
    setTurnstileRound((round) => round + 1);
    if (ok) refreshChain();
  };
  const shares = async () => {
    if (await demo.receiveShares()) refreshChain();
  };
  const simulate = async () => {
    if (await demo.simulateMonth()) refreshChain();
  };
  const claimFleet = async () => {
    if (fleet && (await claim(fleet))) refreshChain();
  };

  return (
    <ol className="flex flex-col gap-4">
      <Step
        index={1}
        step="access"
        state={progress.access}
        title={t('accessTitle')}
        body={
          progress.access === 'done' && kyc.investor
            ? t('accessDoneBody', { date: formatDate(kyc.investor.expiresAt, locale) })
            : t('accessBody', {
                amount:
                  status.access.dripAmount && fleet
                    ? amount(BigInt(status.access.dripAmount))
                    : '—',
              })
        }
      >
        {progress.access === 'done' && fleet && <Balance project={fleet} version={chainVersion} />}
        {needsTurnstile &&
          (TURNSTILE_SITE_KEY ? (
            <Turnstile
              key={turnstileRound}
              siteKey={TURNSTILE_SITE_KEY}
              onToken={(token) => {
                setTurnstileFailed(false);
                setTurnstileToken(token);
              }}
              onError={() => setTurnstileFailed(true)}
            />
          ) : (
            <p className="text-small text-destructive">{tErrors('misconfigured')}</p>
          ))}
        {turnstileFailed && <p className="text-small text-destructive">{t('turnstileFailed')}</p>}
        {(progress.access !== 'done' || !demo.session) && (
          <Button
            variant={progress.access === 'done' ? 'secondary' : 'primary'}
            onClick={access}
            disabled={demo.busy !== null || (needsTurnstile && !turnstileToken)}
          >
            <Spinner on={demo.busy === 'access'} />
            {progress.access === 'done' ? t('signInAgain') : t('accessAction')}
          </Button>
        )}
        {progress.access === 'done' && !demo.session && (
          <p className="text-small text-muted-foreground">{t('signInAgainHint')}</p>
        )}
        <StepError message={demo.errors.access} />
        <TxLink signature={demo.signatures.access} />
      </Step>

      <Step
        index={2}
        step="buy"
        state={progress.buy}
        title={t('buyTitle')}
        body={progress.buy === 'done' ? t('buyDoneBody') : t('buyBody')}
      >
        {progress.buy !== 'done' && <OpenRaises raises={raises} />}
      </Step>

      <Step
        index={3}
        step="shares"
        state={progress.shares}
        title={t('sharesTitle')}
        body={
          progress.shares === 'done'
            ? t('sharesDoneBody', {
                count: formatCount(fleetHolding?.position.shares ?? 0n, locale),
                car: fleetName,
              })
            : t('sharesBody', { count: formatCount(sharesPerWallet, locale), car: fleetName })
        }
      >
        {progress.shares !== 'done' && (
          <Button
            variant={progress.shares === 'current' ? 'primary' : 'secondary'}
            onClick={shares}
            disabled={demo.busy !== null || !verified || !demo.session}
          >
            <Spinner on={demo.busy === 'shares'} />
            {t('sharesAction', { count: formatCount(sharesPerWallet, locale) })}
          </Button>
        )}
        <StepError message={demo.errors.shares} />
        <TxLink signature={demo.signatures.shares} />
      </Step>

      <Step
        index={4}
        step="simulate"
        state={progress.simulate}
        title={t('simulateTitle')}
        body={t('simulateBody')}
      >
        {fleetHolding && fleetHolding.pending > 0n && (
          <p className="text-body text-foreground">
            {t('pending', { amount: amount(fleetHolding.pending) })}
          </p>
        )}
        <Button
          variant={progress.simulate === 'current' ? 'primary' : 'secondary'}
          onClick={simulate}
          disabled={
            demo.busy !== null || progress.shares !== 'done' || !demo.session || cooldown !== null
          }
        >
          <Spinner on={demo.busy === 'simulate'} />
          {progress.simulate === 'done' ? t('simulateAgain') : t('simulateAction')}
        </Button>
        {cooldown !== null && (
          <p aria-live="polite" className="text-small text-muted-foreground">
            {t('cooldown', { seconds: cooldown })}
          </p>
        )}
        <StepError message={demo.errors.simulate} />
        <TxLink signature={demo.signatures.simulate} />
      </Step>

      <Step
        index={5}
        step="claim"
        state={progress.claim}
        title={t('claimTitle')}
        body={
          progress.claim === 'done' && fleetHolding
            ? t('claimDoneBody', { amount: amount(fleetHolding.position.totalClaimed) })
            : t('claimBody')
        }
      >
        {fleetHolding && fleetHolding.pending > 0n && (
          <Button
            variant={progress.claim === 'current' ? 'primary' : 'secondary'}
            onClick={claimFleet}
            disabled={
              claimStatus === 'preflight' ||
              claimStatus === 'awaiting_wallet' ||
              claimStatus === 'confirming'
            }
          >
            {t('claimAction', { amount: amount(fleetHolding.pending) })}
          </Button>
        )}
      </Step>

      <Step
        index={6}
        step="verify"
        state={progress.verify}
        title={t('verifyTitle')}
        body={t('verifyBody')}
      >
        {fleetMint && (
          <Link href={`/assets/${fleetMint}#verify-data-title`} className={linkClasses}>
            {t('verifyAction', { car: fleetName })}
            <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        )}
      </Step>

      <Step
        index={7}
        step="solvency"
        state={progress.solvency}
        title={t('solvencyTitle')}
        body={t('solvencyBody')}
      >
        <Link href={fleetMint ? `/solvency#${fleetMint}` : '/solvency'} className={linkClasses}>
          {t('solvencyAction')}
          <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      </Step>
    </ol>
  );
}

/** The wallet's balance of the car's payment token, read again whenever `version` changes. */
function Balance({ project, version }: { project: Project; version: number }): JSX.Element | null {
  const t = useTranslations('DemoAccess');
  const locale = useLocale();
  const { balance, refetch } = usePaymentBalance(project.payment);
  const shownVersion = useRef(version);
  useEffect(() => {
    if (shownVersion.current === version) return;
    shownVersion.current = version;
    refetch();
  }, [version, refetch]);
  if (balance === null) return null;
  return (
    <p className="text-body text-foreground">
      {t('balance', { amount: formatTokenAmount(balance, project.payment, locale) })}
    </p>
  );
}

/**
 * The judges' path on one page: get demo access, buy in an open raise, receive shares of an
 * operating car, simulate a month, claim, then verify the car's data and the proof of
 * solvency. Every step reads its state from the chain.
 */
export function DemoWalkthrough({ api }: { api?: DemoApi }): JSX.Element {
  const t = useTranslations('DemoAccess');
  const tErrors = useTranslations('DemoErrors');
  const { connected } = useWallet();
  const demo = useDemoAccess(api);

  let body: React.ReactNode;
  if (!connected) {
    body = (
      <ConnectWalletPanel
        title={t('connectTitle')}
        body={t('connectBody', { network: NETWORK_NAME })}
        pointsTitle={t('connectPointsTitle')}
        points={[t('connectPoint1'), t('connectPoint2'), t('connectPoint3')]}
      />
    );
  } else if (demo.statusError) {
    body = (
      <Notice
        as="h2"
        title={t('statusErrorTitle')}
        body={t('statusErrorBody')}
        action={
          <Button variant="secondary" onClick={demo.refetchStatus}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('retry')}
          </Button>
        }
      />
    );
  } else if (!demo.status) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    );
  } else if (!demo.status.available && demo.status.code) {
    body = (
      <Notice
        as="h2"
        title={t('unavailableTitle')}
        body={tErrors(demo.status.code, { seconds: 60 })}
        action={
          <Button variant="secondary" onClick={demo.refetchStatus}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('retry')}
          </Button>
        }
      />
    );
  } else {
    body = <Walkthrough demo={demo} />;
  }

  return (
    <>
      <PageHeader
        overline={t('overline', { network: NETWORK_NAME })}
        title={t('title')}
        lead={t('lead', { network: NETWORK_NAME })}
      />
      <div className="mt-10">{body}</div>
      <p className="mt-10 max-w-[65ch] text-small text-muted-foreground">
        {t('fineprint', { network: NETWORK_NAME })}
      </p>
    </>
  );
}

