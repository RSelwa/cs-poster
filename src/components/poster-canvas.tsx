import { useEffect, useRef, useState } from 'react';
import { FONTS, FONT_FACES, LOCAL_FONTS, fontFaceCss } from '@/core/fonts.ts';
import { renderPoster, type PosterParams } from '@/core/render.ts';
import type { Match } from '@/core/types.ts';

const PREVIEW_FAST = 480;
const PREVIEW_SHARP = 1000;
const SHARP_DELAY_MS = 260;
const FONTS_TIMEOUT_MS = 2500;

document.head.append(Object.assign(document.createElement('style'), { textContent: LOCAL_FONTS.map((f) => fontFaceCss(f, `/fonts/${encodeURIComponent(f.file)}`)).join('') }));

// Les polices du poster sont chargées une fois ; au-delà du délai, on dessine avec les polices de repli.
const fontsReady = Promise.race([
  Promise.all(FONT_FACES.map((f) => document.fonts.load(f).catch(() => []))),
  new Promise((r) => setTimeout(r, FONTS_TIMEOUT_MS)),
]);

type Props = { match: Match; params: PosterParams };

// Aperçu : un rendu rapide à 480 px dès qu'un réglage bouge, puis un rendu net à 1000 px quand il s'arrête.
export const PosterCanvas = ({ match, params }: Props) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [sharp, setSharp] = useState<Props | null>(null);
  const busy = sharp?.match !== match || sharp?.params !== params;

  useEffect(() => {
    let cancelled = false, timer = 0, frame = 0;
    const draw = (w: number) => {
      const c = ref.current;
      if (!c || cancelled) return;
      c.width = w; c.height = Math.round((w * 4) / 3);
      renderPoster(c.getContext('2d')!, c.width, c.height, match, params, FONTS);
    };
    fontsReady.then(() => {
      frame = requestAnimationFrame(() => {
        draw(PREVIEW_FAST);
        timer = window.setTimeout(() => { draw(PREVIEW_SHARP); if (!cancelled) setSharp({ match, params }); }, SHARP_DELAY_MS);
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [match, params]);

  return (
    <div className="relative aspect-[3/4] w-[min(100cqw,75cqh)] bg-paper shadow-[0_1px_2px_rgba(20,28,24,.25),0_18px_40px_-18px_rgba(20,28,24,.45)]">
      <canvas ref={ref} className="block size-full" aria-label="Affiche générée" />
      <span className="pointer-events-none absolute top-3 left-3 rounded-sm bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground opacity-0 transition-opacity data-[busy=true]:opacity-100 motion-reduce:transition-none" data-busy={busy}>rendu…</span>
    </div>
  );
};
