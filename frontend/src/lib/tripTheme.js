// Per-trip destination palettes, shared by the live UI and the print sheet so
// paper matches screen. The destination name hashes to a stable palette;
// colors stay legible in grayscale print and against the warm-ink dark mode.
export const PALETTES = [
  { name: 'azure',      accent: '#0e7490', accentRgb: '14 116 144',  glowRgb: '34 211 238',  soft: '#ecfeff', rule: '#67e8f9', motif: '✈',  gradFrom: '#155e75', gradTo: '#0d9488' },
  { name: 'terracotta', accent: '#c2410c', accentRgb: '194 65 12',   glowRgb: '251 146 60',  soft: '#fff7ed', rule: '#fdba74', motif: '🏛', gradFrom: '#9a3412', gradTo: '#c2410c' },
  { name: 'forest',     accent: '#15803d', accentRgb: '21 128 61',   glowRgb: '74 222 128',  soft: '#f0fdf4', rule: '#86efac', motif: '⛰',  gradFrom: '#14532d', gradTo: '#15803d' },
  { name: 'plum',       accent: '#7e22ce', accentRgb: '126 34 206',  glowRgb: '192 132 252', soft: '#faf5ff', rule: '#d8b4fe', motif: '🌸', gradFrom: '#581c87', gradTo: '#7e22ce' },
  { name: 'sunset',     accent: '#b45309', accentRgb: '180 83 9',    glowRgb: '251 191 36',  soft: '#fffbeb', rule: '#fcd34d', motif: '🌅', gradFrom: '#92400e', gradTo: '#b45309' },
  { name: 'midnight',   accent: '#1d4ed8', accentRgb: '29 78 216',   glowRgb: '96 165 250',  soft: '#eff6ff', rule: '#93c5fd', motif: '🌃', gradFrom: '#1e3a8a', gradTo: '#1d4ed8' },
];

export function paletteFor(destination) {
  let h = 0;
  for (const c of destination || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

// Inline-style object that activates a trip's palette for everything inside
// the element it's applied to (bg-accent, .trip-grad, glows, etc).
export function tripThemeVars(destination) {
  const p = paletteFor(destination);
  return {
    '--trip-accent': p.accentRgb,
    '--trip-glow': p.glowRgb,
    '--trip-grad-from': p.gradFrom,
    '--trip-grad-to': p.gradTo,
  };
}
