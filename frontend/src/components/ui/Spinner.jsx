export const Spinner = ({ size = 18, color = 'currentColor' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    className="animate-spin"
  >
    <circle cx="12" cy="12" r="9" strokeOpacity="0.18" />
    <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
  </svg>
)
