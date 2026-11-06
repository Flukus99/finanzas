import type { SVGProps } from 'react'

const base = (d: string[]) => (p: SVGProps<SVGSVGElement>) => (
  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={22} height={22} {...p}>
    {d.map((x) => <path key={x} d={x} />)}
  </svg>
)

export const HomeIcon = base(['M3 10.5 12 3l9 7.5', 'M5 9v11h5v-6h4v6h5V9'])
export const ListIcon = base(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01'])
export const WalletIcon = base(['M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3', 'M3 7.5v10A2.5 2.5 0 0 0 5.5 20H21V8H5.5A2.5 2.5 0 0 1 3 5.5', 'M16.5 14h.01'])
export const GearIcon = base(['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'])
export const PlusIcon = base(['M12 5v14', 'M5 12h14'])
export const ChevronLeft = base(['m15 18-6-6 6-6'])
export const ChevronRight = base(['m9 18 6-6-6-6'])
export const SearchIcon = base(['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-3.5-3.5'])
export const CalendarIcon = base(['M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z', 'M4 10h16', 'M8 3v4', 'M16 3v4', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01'])
export const PigIcon = base(['M19 11.5c0 3.6-3.1 6.5-7 6.5s-7-2.9-7-6.5S8.1 5 12 5s7 2.9 7 6.5Z', 'M8 17.5V20', 'M16 17.5V20', 'M19 10h1.5', 'M10 5.5 9 3.5', 'M15.5 10h.01', 'M10 8.5h4'])
export const ChartIcon = base(['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'])
export const CardIcon = base(['M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5z', 'M3 10h18', 'M7 14.5h3'])
export const CloseIcon = base(['M6 6l12 12', 'M18 6 6 18'])
export const ArrowUpIcon = base(['M7 17 17 7', 'M8 7h9v9'])
export const ArrowDownIcon = base(['M17 7 7 17', 'M16 17H7V8'])
export const SwapIcon = base(['M7 7h12l-3-3', 'M17 17H5l3 3'])
export const LandmarkIcon = base(['M3 21h18', 'M5 21V10', 'M19 21V10', 'M9 21V10', 'M15 21V10', 'M12 3 3 8h18z'])
export const SparkIcon = base(['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'm5.6 5.6 2.8 2.8', 'm15.6 15.6 2.8 2.8', 'm5.6 18.4 2.8-2.8', 'm15.6 8.4 2.8-2.8'])
