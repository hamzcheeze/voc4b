import React from "react";
const paths = {
  plus: <path suppressHydrationWarning d="M12 5v14M5 12h14" />,
  check: <path suppressHydrationWarning d="m5 12 4 4L19 6" />,
  arrow: <path suppressHydrationWarning d="M5 12h14m-6-6 6 6-6 6" />,
  close: <path suppressHydrationWarning d="m6 6 12 12M6 18 18 6" />,
  volume: (
    <>
      <path suppressHydrationWarning d="m11 5-6 4H2v6h3l6 4V5Z" />
      <path
        suppressHydrationWarning
        d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"
      />
    </>
  ),
  moon: (
    <path
      suppressHydrationWarning
      d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z"
    />
  ),
  sun: (
    <>
      <circle suppressHydrationWarning cx="12" cy="12" r="4" />
      <path
        suppressHydrationWarning
        d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"
      />
    </>
  ),
  notebook: (
    <>
      <rect
        suppressHydrationWarning
        x="5"
        y="3"
        width="15"
        height="18"
        rx="2"
      />
      <path suppressHydrationWarning d="M9 3v18M3 7h4m-4 5h4m-4 5h4" />
    </>
  ),
};
export function Icon({
  name,
  className,
}: {
  name: keyof typeof paths;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      suppressHydrationWarning
    >
      {paths[name]}
    </svg>
  );
}
