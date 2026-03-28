export const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`flex items-center space-x-2.5 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 flex-none text-text-primary">
        {/* Core Token Axis */}
        <circle cx="16" cy="19" r="6" fill="#06B6D4" />
        {/* A shape framing the axis */}
        <path d="M16 2 L2 30 L9 30 L16 16 L23 30 L30 30 Z" fill="currentColor" />
        {/* Classic flat crossbar completing the 'A' */}
        <rect x="9" y="19" width="14" height="4" fill="currentColor" />
      </svg>
      <span className="text-xl font-bold tracking-[0.16em] uppercase text-text-primary mt-[2px]">
        AXEL
      </span>
    </div>
  );
};
