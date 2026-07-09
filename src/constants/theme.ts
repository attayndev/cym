import '@/global.css';

/**
 * The Call Your Mom brand system (source of truth: the marketing site).
 * Component language: 2px espresso borders, hard offset shadows (no blur,
 * no gradients), Fraunces 900 display + Karla body.
 */
export const colors = {
  // brand primitives
  cream: '#FFF7E8',
  butter: '#FFD466',
  cherry: '#D9331F', // large fills/buttons only — never small text on cream
  cherryDeep: '#B3260F', // small colored text on cream (AA contrast)
  espresso: '#3B241C',
  avocado: '#7A8B4C', // secondary accent, sparingly
  blush: '#F9DFC9', // soft fills

  // semantic tokens (names preserved across the app)
  creamDeep: '#F9DFC9',
  ink: '#3B241C',
  inkSoft: 'rgba(59,36,28,0.9)',
  muted: '#766359',
  line: '#3B241C',
  card: '#3B241C',
  cardText: '#FFF7E8',
  cardMuted: 'rgba(255,247,232,0.8)',
  accent: '#D9331F',
  accentSoft: '#F9DFC9',
  danger: '#B3260F',

  // health ramp — brand-derived hues, fg legible on its bg
  warm: '#55613A',
  warmSoft: '#E4E9D3',
  cooling: '#7A540E',
  coolingSoft: '#FFE9B3',
  atRisk: '#B3260F',
  atRiskSoft: '#F9DFC9',
  cold: '#6B5A50',
  coldSoft: '#EFE6D8',

  white: '#FFFFFF',
} as const;

export const fonts = {
  display: 'Fraunces_900Black',
  displayMedium: 'Fraunces_600SemiBold',
  sans: 'Karla_400Regular',
  sansMedium: 'Karla_500Medium',
  sansBold: 'Karla_700Bold',
} as const;

/** Brand hard offset shadow. RN 0.85's boxShadow style works on iOS,
 *  Android 9+, and web — blur stays 0 by design. */
export function hardShadow(size: number, color: string = colors.espresso) {
  return { boxShadow: `${size}px ${size}px 0px ${color}` } as const;
}

export const shadows = {
  card: hardShadow(6, 'rgba(59,36,28,0.12)'),
  nudge: hardShadow(3, 'rgba(59,36,28,0.15)'),
  button: hardShadow(4, colors.espresso),
  buttonSoft: hardShadow(4, 'rgba(59,36,28,0.25)'),
  pressed: hardShadow(1, colors.espresso),
} as const;

export const healthColors = {
  // 'new' = no logged touch yet (fresh imports): deliberately neutral so it
  // reads as "no data", not as a good or bad state.
  new: { fg: colors.muted, bg: colors.white, label: 'New' },
  warm: { fg: colors.warm, bg: colors.warmSoft, label: 'Warm' },
  cooling: { fg: colors.cooling, bg: colors.coolingSoft, label: 'Cooling' },
  'at-risk': { fg: colors.atRisk, bg: colors.atRiskSoft, label: 'At risk' },
  cold: { fg: colors.cold, bg: colors.coldSoft, label: 'Cold' },
} as const;
