/** Dark, camera-app palette + spacing. All UI is RTL/Hebrew. */

export const colors = {
  bg: '#0A0E17',
  surface: '#111827',
  surfaceAlt: '#1B2436',
  border: '#28324A',
  text: '#F8FAFC',
  textDim: '#94A3B8',
  accent: '#38BDF8',
  accentSoft: 'rgba(56,189,248,0.16)',
  success: '#34D399',
  warn: '#FBBF24',
  danger: '#F87171',
  overlay: 'rgba(4,8,16,0.6)',
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
