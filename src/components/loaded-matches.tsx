import { RoundStrip } from '@/components/round-strip.tsx';
import { computeDrama } from '@/core/match.ts';
import type { Match, Pair } from '@/core/types.ts';

type Props = { built: Match[]; current: number; colors: Pair<string>; onSelect: (i: number) => void };

const subtitle = (d: Match) => (d.series ? d.mapInfo.map((x) => `${x.map || 'Map'} ${x.score[0]}–${x.score[1]}`).join(' · ') : `${d.mapInfo[0].map || 'Map'} · ${d.rounds.length} rounds`);

// Matchs chargés dans l'éditeur, et le détail de celui qui est affiché.
export const LoadedMatches = ({ built, current, colors, onSelect }: Props) => {
  const d = built[current];
  if (!d) return null;
  const facts: [string, string | number][] = [['Maps', d.maps.length], ['Rounds', d.rounds.length], ['Drame', computeDrama(d).toFixed(2)], ['Événement', d.event || '—']];

  return (
    <section>
      <h2 className="mt-6 mb-2 text-[13px] font-semibold">Matchs chargés</h2>
      <ul className="grid gap-1.5">
        {built.map((m, i) => (
          <li key={i}>
            <button type="button" aria-pressed={i === current} onClick={() => onSelect(i)}
              className="grid w-full gap-px rounded-md border bg-muted px-2.5 py-2 text-left aria-pressed:border-foreground aria-pressed:shadow-[inset_0_0_0_1px_var(--foreground)]">
              <span className="font-semibold">{m.teams[0].name} {m.teams[0].score}–{m.teams[1].score} {m.teams[1].name}</span>
              <span className="text-xs text-muted-foreground">{subtitle(m)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2.5"><RoundStrip match={d} colors={colors} /></div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-mono text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
