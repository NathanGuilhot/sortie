interface LogoProps {
  className?: string;
  variant?: 'color' | 'mono';
  title?: string;
}

export function Logo({ className, variant = 'color', title = 'Sortie' }: LogoProps) {
  if (variant === 'mono') {
    return (
      <svg
        className={className}
        viewBox="0 0 1024 1024"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={title}
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth={48}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M 312 450 A 240 240 0 0 1 792 450 L 792 830 L 312 830 Z" />
          <path d="M 262 420 A 240 240 0 0 1 742 420 L 742 800 L 262 800 Z" />
          <circle cx={502} cy={500} r={80} />
          <path d="M 880 220 L 892 268 L 940 280 L 892 292 L 880 340 L 868 292 L 820 280 L 868 268 Z" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <rect width={1024} height={1024} rx={180} ry={180} fill="#FFFFFF" />
      <path d="M 312 450 A 240 240 0 0 1 792 450 L 792 830 L 312 830 Z" fill="#C9B8E8" />
      <path d="M 262 420 A 240 240 0 0 1 742 420 L 742 800 L 262 800 Z" fill="#F4A896" />
      <circle cx={502} cy={500} r={80} fill="#8BD4B8" />
      <circle cx={502} cy={500} r={26} fill="#FFFFFF" />
      <path
        d="M 880 220 L 892 268 L 940 280 L 892 292 L 880 340 L 868 292 L 820 280 L 868 268 Z"
        fill="#FAD06F"
      />
      <circle cx={215} cy={840} r={20} fill="#F4A896" />
      <circle cx={855} cy={855} r={20} fill="#C9B8E8" />
    </svg>
  );
}
