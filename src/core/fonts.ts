// Polices du poster : chargées par index.html dans l'éditeur, par server/render.ts dans le rendu headless.
import type { Fonts } from './render.ts';

export const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Familjen+Grotesk:wght@400;500;600&family=DM+Mono&display=swap';
export const FONTS: Fonts = { serif: "'Instrument Serif', Georgia, serif", sans: "'Familjen Grotesk', system-ui, sans-serif", mono: "'DM Mono', ui-monospace, monospace" };
export const FONT_FACES = ['1em "Instrument Serif"', '500 1em "Familjen Grotesk"', '600 1em "Familjen Grotesk"', '1em "DM Mono"'];
