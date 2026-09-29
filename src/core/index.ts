// Point d'entrée du moteur. server/render.ts l'empaquette en IIFE (window.PosterCore) pour la page headless.
export { buildMatch, computeDrama, keyRounds, teamTotals } from './match.ts';
export { renderPoster, DEFAULTS, THEMES, defaultColors } from './render.ts';
export type { PosterParams, Theme, Fonts } from './render.ts';
export { demoMatch } from './demo.ts';
export * from './types.ts';
