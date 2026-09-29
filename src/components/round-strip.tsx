import { useEffect, useRef } from 'react';
import type { Match, Pair } from '@/core/types.ts';

const W = 580, H = 88, MAP_GAP = 8;

type Props = { match: Match; colors: Pair<string> };

// Bandeau : rangée du haut = rounds gagnés par l'équipe de gauche, rangée du bas = équipe de droite ; un espace sépare les maps.
export const RoundStrip = ({ match, colors }: Props) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    const n = match.rounds.length;
    const bw = (W - MAP_GAP * (match.maps.length - 1)) / Math.max(n, 1);
    c.clearRect(0, 0, W, H);
    match.rounds.forEach((r, i) => {
      c.fillStyle = colors[r.winner];
      c.fillRect(i * bw + r.map * MAP_GAP + 0.5, r.winner === 0 ? 6 : H / 2 + 3, Math.max(1, bw - 1), H / 2 - 9);
    });
  }, [match, colors]);

  return <canvas ref={ref} width={W} height={H} className="block h-11 w-full rounded-md border bg-muted" aria-label="Rounds gagnés par chaque équipe, map après map" />;
};
