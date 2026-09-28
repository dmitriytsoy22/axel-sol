import type { Metadata, ResolvingMetadata } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTranslations } from 'next-intl/server';
import { AssetPage } from '@/components/asset/AssetPage';
import { SOLANA_RPC_URL } from '@/lib/solana/connection';
import { projectAddress } from '@/lib/solana/pda';
import { carMetadata, carTitle, readTokenMetadata } from '@/lib/solana/tokens';

interface Props {
  params: { locale: string; id: string };
}

/** The title read holds back the page's first byte, so a slow RPC node costs at most this. */
const TITLE_READ_MS = 1_500;

/**
 * "Kia Rio 2021 · AXKR017" for the tab, the history and link previews: the car's share mint
 * metadata, read in one RPC call together with its project account. The share symbol tells
 * apart cars of one model, as the fleet's three Chevrolet Cobalts. Null when the address is no AXEL
 * car; undefined when Solana didn't answer in time, and the page keeps the site's title
 * while the page itself reports the failed read.
 */
async function readCarName(id: string): Promise<string | null | undefined> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(id);
  } catch {
    return null;
  }
  const connection = new Connection(process.env.DEMO_RPC_URL || SOLANA_RPC_URL, 'confirmed');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), TITLE_READ_MS);
  });
  const read = connection.getMultipleAccountsInfo([projectAddress(mint), mint]).then(
    ([project, mintAccount]) => {
      if (!project || !mintAccount) return null;
      const car = carMetadata(readTokenMetadata(mint, mintAccount));
      const name = `${carTitle(car)} ${car.year ?? ''}`.trim();
      return name ? [name, car.symbol].filter(Boolean).join(' · ') : undefined;
    },
    () => undefined,
  );
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function generateMetadata(
  { params: { locale, id } }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const name = await readCarName(id);
  if (name === undefined) return {};
  if (name === null) {
    const t = await getTranslations({ locale, namespace: 'Asset' });
    return { title: t('notFound') };
  }
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const { openGraph, twitter } = await parent;
  // A page's preview fields replace the layout's whole instead of merging with them, so the
  // description and the social card image are carried over.
  return {
    title: name,
    openGraph: {
      title: name,
      description: t('ogDescription'),
      type: 'website',
      siteName: 'AXEL',
      images: openGraph?.images,
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description: t('ogDescription'),
      images: twitter?.images,
    },
  };
}

export default function AssetDetailsPage({ params: { id } }: Props): JSX.Element {
  return <AssetPage id={id} />;
}
