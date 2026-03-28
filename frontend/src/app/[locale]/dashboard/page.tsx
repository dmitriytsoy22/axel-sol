export default function DashboardPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-5">
      <div className="max-w-page w-full animate-fade-in">
        <h1 className="text-headline text-text-primary mb-2">Dashboard</h1>
        <p className="text-body text-text-secondary">
          Your portfolio, holdings, and revenue — all from on-chain data.
        </p>
        <p className="text-footnote text-text-tertiary mt-4">
          Full dashboard will be implemented in Task 9.
        </p>
      </div>
    </div>
  );
}
