// Polices du poster : chargées par index.html dans l'éditeur, par server/render.ts dans le rendu headless.
// Police locale : déposer le fichier dans public/fonts/, la déclarer dans LOCAL_FONTS, puis mettre sa famille
// en tête du rôle voulu dans FONTS (serif : titres et score, sans : textes, mono : pied de page et fond de données).
import type { Fonts } from './render.ts';

// weight : '400', ou une plage '100 900' pour une police variable
export type LocalFont = { family: string; file: string; weight?: string; style?: string };

export const LOCAL_FONTS: LocalFont[] = [];

export const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Familjen+Grotesk:wght@400;500;600;700&family=DM+Mono&display=swap';
export const FONTS: Fonts = { serif: "'Instrument Serif', Georgia, serif", sans: "'Familjen Grotesk', system-ui, sans-serif", mono: "'DM Mono', ui-monospace, monospace" };
export const FONT_FACES = ['1em "Instrument Serif"', '500 1em "Familjen Grotesk"', '600 1em "Familjen Grotesk"', '700 1em "Familjen Grotesk"', '1em "DM Mono"', ...LOCAL_FONTS.map((f) => `${f.style || 'normal'} ${(f.weight || '400').split(' ')[0]} 1em "${f.family}"`)];

// src : l'url du fichier (/fonts/… dans l'éditeur, data: dans le rendu headless)
export const fontFaceCss = (f: LocalFont, src: string) => `@font-face{font-family:"${f.family}";src:url("${src}");font-weight:${f.weight || '400'};font-style:${f.style || 'normal'};font-display:block}`;
