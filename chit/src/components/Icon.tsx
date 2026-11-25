import type { CSSProperties } from "react";

const paths = {
  receipt: ["M6 3h12v18l-3-2-3 2-3-2-3 2V3Z", "M9 7h6M9 11h6M9 15h3"],
  shield: ["m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z", "m8 12 3 3 5-6"],
  check: ["m5 12 4 4L19 6"],
  arrow: ["M4 12h16m-6-6 6 6-6 6"],
  external: ["M14 4h6v6m0-6L10 14", "M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"],
  wallet: ["M20 8V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15v12H5a2 2 0 0 1-2-2V6", "M20 12h-5v4h5M16 14h.01"],
  qr: ["M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Z", "M15 15h3v3h3v3h-6v-3h-3v-3h3Zm6-3v3M12 3v3M3 12h3M12 9v3h3"],
  search: ["M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z", "m15 15 6 6"],
  hash: ["M9 3 7 21M17 3l-2 18M4 8h17M3 16h17"],
  copy: ["M9 9h11v11H9V9Z", "M15 5V3H3v12h2"],
  download: ["M12 3v12m-5-5 5 5 5-5", "M4 17v4h16v-4"],
  refresh: ["M20 7v5h-5M4 17v-5h5", "M5 7a8 8 0 0 1 13-2l2 2M4 17l2 2a8 8 0 0 0 13-2"],
  chevron: ["m9 5 7 7-7 7"],
  x: ["m6 6 12 12M6 18 18 6"],
  clock: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M12 7v5l3 2"],
  alert: ["m12 3 10 18H2L12 3Z", "M12 9v5m0 3h.01"],
  lock: ["M5 10h14v11H5V10Z", "M8 10V7a4 4 0 0 1 8 0v3M12 14v3"],
  plus: ["M12 5v14M5 12h14"],
  upload: ["M12 16V3m-5 5 5-5 5 5", "M4 16v5h16v-5"],
  trash: ["M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"],
  sparkles: ["m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z", "M20 2v4M18 4h4"],
  info: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M12 11v6m0-10h.01"],
  globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18", "M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"],
} as const;

export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, className = "", style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }): JSX.Element {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className} style={style}>{paths[name].map((d, index) => <path d={d} key={index} />)}</svg>;
}
