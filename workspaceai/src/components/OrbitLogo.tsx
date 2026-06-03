export function OrbitLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M 50 15 A 35 35 0 1 1 15 50"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M 50 24 A 26 26 0 1 1 24 50"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        transform="rotate(40 50 50)"
        opacity="0.55"
      />
      <path
        d="M 50 33 A 17 17 0 1 1 33 50"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        transform="rotate(100 50 50)"
        opacity="0.3"
      />
      <circle cx="50" cy="50" r="6" fill="currentColor" />
      <circle cx="15" cy="50" r="5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
