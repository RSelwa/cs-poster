import { useMemo, useState } from 'react';
import { Bo3Matches } from '@/components/bo3-matches.tsx';
import { ControlsPanel } from '@/components/controls-panel.tsx';
import { FixturePicker } from '@/components/fixture-picker.tsx';
import { HowToRead } from '@/components/how-to-read.tsx';
import { ImportZone } from '@/components/import-zone.tsx';
import { LoadedMatches } from '@/components/loaded-matches.tsx';
import { PosterCanvas } from '@/components/poster-canvas.tsx';
import { Button } from '@/components/ui/button';
import { demoMatch } from '@/core/demo.ts';
import { buildMatch } from '@/core/match.ts';
import { DEFAULTS, defaultColors, type PosterParams } from '@/core/render.ts';
import type { MapData } from '@/core/types.ts';
import { download } from '@/lib/download.ts';
import { addMaps, parseImport, type LoadedMatch } from '@/lib/loaded-matches.ts';

type Status = { message: string; error: boolean };

const colorsFor = (maps: MapData[]) => defaultColors(buildMatch(maps).teams.map((t) => t.name));

const initial = () => {
  const { matches, index } = addMaps([], demoMatch());
  return { matches, current: index, params: { ...DEFAULTS, colors: colorsFor(matches[index].maps) } };
};

export const App = () => {
  const [start] = useState(initial);
  const [matches, setMatches] = useState<LoadedMatch[]>(start.matches);
  const [current, setCurrent] = useState(start.current);
  const [params, setParams] = useState<PosterParams>(start.params);
  const [status, setStatus] = useState<Status>({ message: 'Match de démonstration chargé. Choisis un match tier 1 ci-dessus.', error: false });

  const built = useMemo(() => matches.map((m) => buildMatch(m.maps)), [matches]);
  const say = (message: string, error = false) => setStatus({ message, error });
  const patch = (p: Partial<PosterParams>) => setParams((prev) => ({ ...prev, ...p }));

  // Chaque match garde ses couleurs par défaut : on les remet quand on change de match affiché.
  const select = (list: LoadedMatch[], i: number) => {
    if (i !== current) patch({ colors: colorsFor(list[i].maps) });
    setCurrent(i);
  };

  const load = (maps: MapData[], message: string) => {
    const r = addMaps(matches, maps);
    setMatches(r.matches);
    select(r.matches, r.index);
    say(message);
  };

  const importFiles = async (files: File[]) => {
    try {
      const maps = (await Promise.all(files.map(async (f) => parseImport(await f.text())))).flat();
      load(maps, `${maps.length} map${maps.length > 1 ? 's' : ''} importée${maps.length > 1 ? 's' : ''}.`);
    } catch (err) { say((err as Error).message, true); }
  };

  const exportJson = () => {
    const d = built[current];
    download(new Blob([JSON.stringify({ version: 2, maps: matches[current].maps }, null, 2)], { type: 'application/json' }), `${d.matchId || 'match'}-${d.teams[0].name}-vs-${d.teams[1].name}.json`);
  };

  return (
    <div className="grid h-full grid-cols-[330px_minmax(0,1fr)_320px] max-[1000px]:h-auto max-[1000px]:grid-cols-1">
      <aside className="overflow-y-auto border-r bg-card px-5 pt-5 pb-8 max-[1000px]:border-0" aria-label="Données du match">
        <h1 className="mb-1 font-serif text-[26px] leading-tight">Affiches CS2</h1>
        <p className="mb-5 text-muted-foreground">Un match devient une peinture : deux équipes qui se poussent l’une contre l’autre. Une affiche par match, toutes les maps sur la même toile.</p>

        <Bo3Matches onLoad={load} onStatus={say} />

        <h2 className="mt-6 mb-2 text-[13px] font-semibold">Importer</h2>
        <ImportZone onFiles={importFiles} />
        <p role="status" aria-live="polite" data-error={status.error} className="mt-2.5 min-h-[1.4em] text-[13px] data-[error=true]:text-destructive">{status.message}</p>
        <div className="mt-1.5 flex gap-2">
          <Button variant="outline" onClick={() => load(demoMatch(), 'Match de démonstration chargé (3 maps).')}>Charger la démo</Button>
          <Button variant="outline" onClick={exportJson}>Exporter le JSON</Button>
        </div>

        <FixturePicker onLoad={load} />
        <LoadedMatches built={built} current={current} colors={params.colors} onSelect={(i) => select(matches, i)} />
        <HowToRead />
      </aside>

      <main className="grid min-h-0 min-w-0 place-items-center p-7 [container-type:size] max-[1000px]:order-first max-[1000px]:h-[80vh]">
        <PosterCanvas match={built[current]} params={params} />
      </main>

      <aside className="overflow-y-auto border-l bg-card px-5 pt-5 pb-8 max-[1000px]:border-0" aria-label="Réglages de la composition">
        <ControlsPanel match={built[current]} params={params} onChange={patch} />
      </aside>
    </div>
  );
};
