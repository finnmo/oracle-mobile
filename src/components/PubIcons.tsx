export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'clock-icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

/**
 * Default header mark — simple neutral ring (template default).
 */
export function MarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'mark-icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Picnic table — Tabler Icons outline (MIT). Used when a custom icon is not set in some themes.
 * @see https://tabler.io/icons/icon/picnic-table
 */
export function BenchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'bench-icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 7l2 9" />
      <path d="M8 7l-2 9" />
      <path d="M5 7h14" />
      <path d="M3 12h18" />
    </svg>
  );
}

/** Tiny sprout for section titles — Comp C. */
export function SproutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'sprout-icon'}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 14V7" />
      <path d="M8 9c-2.5-1-4-3.2-4-5.5 2.8.2 4.5 1.8 5 4" fill="currentColor" stroke="none" opacity="0.85" />
      <path d="M8 8c2.2-.8 3.8-2.6 4-4.8-2.5.4-3.8 1.8-4 3.5" fill="currentColor" stroke="none" opacity="0.7" />
      <path d="M8 9c-2.5-1-4-3.2-4-5.5" />
      <path d="M8 8c2.2-.8 3.8-2.6 4-4.8" />
    </svg>
  );
}

/** Simple bar-chart mark for Stats titles. */
export function ChartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'chart-icon'}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 17V9" />
      <path d="M8 17V5" />
      <path d="M13 17v-6" />
      <path d="M18 17V3" />
    </svg>
  );
}
