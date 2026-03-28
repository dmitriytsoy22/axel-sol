export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-5">
      <div className="max-w-page w-full text-center animate-fade-in">
        <h1 className="text-display-lg text-text-primary mb-4">
          Invest in Real-World Assets
        </h1>
        <p className="text-title-2 text-text-secondary font-normal mb-8">
          Tokenized taxi assets on Solana. Transparent. On-chain.
        </p>
        <button className="inline-flex items-center justify-center px-6 py-3 bg-brand-primary text-text-on-brand rounded-pill text-body font-normal hover:bg-brand-primary-hover transition-colors duration-normal min-h-[44px]">
          Explore Assets
        </button>
      </div>
    </div>
  );
}
