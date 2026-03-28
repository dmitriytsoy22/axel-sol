import { FC } from 'react';
import { useTranslations } from 'next-intl';

const Footer: FC = () => {
  const t = useTranslations('Footer');

  return (
    <footer
      id="footer"
      className="w-full py-8 mt-auto"
      style={{ borderTop: '0.5px solid #E8E8ED' }}
    >
      <div className="max-w-page-wide mx-auto px-5 md:px-[80px] flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left — Built on Solana */}
        <span className="text-[13px] font-normal text-text-tertiary tracking-[-0.006em]">
          {t('builtOnSolana')}
        </span>

        {/* Right — Links */}
        <div className="flex items-center gap-6">
          <a
            href="https://explorer.solana.com/?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-normal text-text-tertiary hover:text-text-secondary transition-colors duration-fast no-underline"
          >
            Solana Explorer ↗
          </a>
          <a
            href="#"
            className="text-[13px] font-normal text-text-tertiary hover:text-text-secondary transition-colors duration-fast no-underline"
          >
            {t('docs')}
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
