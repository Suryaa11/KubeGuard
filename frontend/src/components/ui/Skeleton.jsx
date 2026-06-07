export const Skeleton = ({ width = '100%', height = 16, className = '' }) => (
  <div
    className={`skeleton rounded-lg ${className}`}
    style={{ width, height }}
    aria-hidden="true"
  />
)
