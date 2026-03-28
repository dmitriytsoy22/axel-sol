export default function AdminPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-5">
      <div className="max-w-page w-full animate-fade-in">
        <h1 className="text-headline text-text-primary mb-2">Admin Panel</h1>
        <p className="text-body text-text-secondary">
          Manage projects, deposit revenue, and monitor platform metrics.
        </p>
        <p className="text-footnote text-text-tertiary mt-4">
          Full admin panel will be implemented in Task 14.
        </p>
      </div>
    </div>
  );
}
