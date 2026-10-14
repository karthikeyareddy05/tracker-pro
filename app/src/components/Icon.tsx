import type { SVGProps } from "react";

const paths = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
  calendar: "M7 3v3M17 3v3M4 9h16M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z",
  track: "M12 5v14M5 12h14",
  insights: "M5 19V11M10 19V5M15 19v-6M20 19V8",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.9-3.4 3.7-5 7-5s6.1 1.6 7 5",
  chevronLeft: "m15 5-7 7 7 7",
  chevronRight: "m9 5 7 7-7 7",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M3 3l18 18M10.6 6.1c.5-.1.9-.1 1.4-.1 6 0 9.5 6 9.5 6a17 17 0 0 1-2.7 3.4M6.7 6.7C4 8.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  check: "m5 12.5 4.5 4.5L19 7.5",
  droplet: "M12 3.5s6 6.4 6 10.5a6 6 0 1 1-12 0c0-4.1 6-10.5 6-10.5Z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  zap: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.5-7.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01",
  activity: "M3 12h4l3 7 4-14 3 7h4",
  alert: "M12 8v5M12 16.5h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6M12 7.5h.01",
  wifiOff: "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 3.5-2.2M12 19.5h.01M15.5 10.6A10 10 0 0 1 19 12.6M2 8.8A15 15 0 0 1 6.3 6M10 5.1A15 15 0 0 1 22 8.8",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  monitor: "M4 5h16v11H4zM9 20h6M12 16v4",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  shield: "M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z",
  phone: "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5ZM11 18.5h2",
  cloud: "M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10a4.3 4.3 0 0 1-.5 8.5z",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  flower: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-6c1.7 2 1.7 4 0 6-1.7-2-1.7-4 0-6Zm0 12c1.7 2 1.7 4 0 6-1.7-2-1.7-4 0-6ZM3 12c2-1.7 4-1.7 6 0-2 1.7-4 1.7-6 0Zm12 0c2-1.7 4-1.7 6 0-2 1.7-4 1.7-6 0Z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="var(--plum)" />
      <circle
        cx="32"
        cy="32"
        r="15"
        fill="none"
        stroke="var(--rose-soft)"
        strokeWidth="4"
        strokeDasharray="68 26"
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
      />
      <circle cx="32" cy="17" r="4" fill="var(--rose)" />
    </svg>
  );
}
