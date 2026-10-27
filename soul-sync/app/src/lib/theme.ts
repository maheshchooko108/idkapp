// Design tokens. System fonts only (SF Pro / Roboto) so Dynamic Type and
// font scaling work for free; sizes are minimums and Text scales from them.
import { useColorScheme } from 'react-native';

const light = {
  bg: '#F7F3EE',
  surface: '#FFFFFF',
  surfaceAlt: '#EFE8DF',
  text: '#1F1A15',
  textMuted: '#6B6158',
  accent: '#7A5C3E',
  accentText: '#FFFFFF',
  border: '#E2D8CC',
  success: '#3F7D5A',
  danger: '#B3412E',
  chip: '#EFE8DF',
  chipActive: '#7A5C3E',
};

const dark: typeof light = {
  bg: '#141210',
  surface: '#1E1B18',
  surfaceAlt: '#292520',
  text: '#F3EEE8',
  textMuted: '#A99F94',
  accent: '#D8B48A',
  accentText: '#1A140E',
  border: '#36302A',
  success: '#7CC39A',
  danger: '#F08A78',
  chip: '#292520',
  chipActive: '#D8B48A',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { md: 12, lg: 20, pill: 999 } as const;

/** Apple HIG text styles (points). Android scales the same numbers as sp. */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, lineHeight: 41 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  headline: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 17, lineHeight: 24 },
  callout: { fontSize: 16, lineHeight: 21 },
  footnote: { fontSize: 13, lineHeight: 18 },
};

/** HIG minimum hit target. */
export const MIN_TOUCH = 44;
