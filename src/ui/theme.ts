/** Dark, camera-app palette + spacing. All UI is RTL/Hebrew. */

export const colors = {
  bg: '#0B0B0F',
  surface: '#16161D',
  surfaceAlt: '#1F1F29',
  border: '#2A2A36',
  text: '#F5F5F7',
  textDim: '#9A9AA8',
  accent: '#3B82F6',
  accentSoft: 'rgba(59,130,246,0.18)',
  success: '#22C55E',
  warn: '#F59E0B',
  danger: '#EF4444',
  overlay: 'rgba(0,0,0,0.55)',
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 36,
} as const;

export const font = {
  title: 24,
  heading: 19,
  body: 16,
  small: 13,
} as const;
