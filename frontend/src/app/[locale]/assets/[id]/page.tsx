export default function AssetDetailPage({ params }: { params: { id: string } }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-5">
      <div className="max-w-page w-full animate-fade-in">
        <h1 className="text-headline text-text-primary mb-2">Asset Detail</h1>
        <p className="text-body text-text-secondary">
          Asset ID: <span className="font-mono text-brand-primary">{params.id}</span>
        </p>
        <p className="text-footnote text-text-tertiary mt-4">
          Full asset detail page will be implemented in Task 5.
        </p>
      </div>
    </div>
  );
}
