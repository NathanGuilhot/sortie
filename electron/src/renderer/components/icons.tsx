type IconProps = {
  className?: string;
  strokeWidth?: number;
};

type StrokeIconProps = IconProps & {
  children: React.ReactNode;
};

function StrokeIcon({ className = 'w-4 h-4', strokeWidth = 2, children }: StrokeIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </StrokeIcon>
  );
}

export function BoardsIcon({ className = 'w-5 h-5', strokeWidth = 2 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5z" />
    </StrokeIcon>
  );
}

export function LockIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="4" y="10" width="16" height="11" rx="2" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={2} d="M8 10V7a4 4 0 118 0v3" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M6 18L18 6M6 6l12 12" />
    </StrokeIcon>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" />
    </StrokeIcon>
  );
}

export function FlipHorizontalIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <path d="m9 6-6 6 6 6V6Zm6 0 6 6-6 6V6Z" />
    </StrokeIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 4v16m8-8H4" />
    </StrokeIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M5 13l4 4L19 7" />
    </StrokeIcon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M15 19l-7-7 7-7" />
    </StrokeIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M19 9l-7 7-7-7" />
    </StrokeIcon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </StrokeIcon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </StrokeIcon>
  );
}

export function PhotoIcon({ className = 'w-4 h-4', strokeWidth = 1.5 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </StrokeIcon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </StrokeIcon>
  );
}

export function FolderOpenIcon({ className = 'w-6 h-6', strokeWidth = 1.5 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M4 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
    </StrokeIcon>
  );
}

export function FolderPlusIcon({ className = 'w-8 h-8', strokeWidth = 1.5 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </StrokeIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </StrokeIcon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </StrokeIcon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </StrokeIcon>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </StrokeIcon>
  );
}

export function BulbIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </StrokeIcon>
  );
}

export function PersonIcon({ className = 'w-4 h-4', strokeWidth = 1.5 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </StrokeIcon>
  );
}

export function PeopleIcon({ className = 'w-5 h-5', strokeWidth = 2 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </StrokeIcon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </StrokeIcon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </StrokeIcon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </StrokeIcon>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </StrokeIcon>
  );
}

export function InfoIcon({ className = 'w-5 h-5', strokeWidth = 1.5 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </StrokeIcon>
  );
}

export function SettingsIcon({ className = 'w-5 h-5', strokeWidth = 2 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </StrokeIcon>
  );
}

export function HeartIcon({
  className = 'w-4 h-4',
  filled = false,
  strokeWidth,
}: IconProps & { filled?: boolean }) {
  const sw = strokeWidth ?? (filled ? 0 : 1.5);
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={sw}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function DotsIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

export function BookIcon({ className = 'w-8 h-8', strokeWidth = 1.5 }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={strokeWidth}>
      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </StrokeIcon>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </StrokeIcon>
  );
}

export function SpinnerIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
