import { useEffect, useState } from 'react';
import { ImageIcon, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MapData } from '@/core/types.ts';
import { fetchMatches, fetchMatchMaps } from '@/lib/api.ts';
import type { MatchSummary } from '@/lib/api-types.ts';

type Props = { onLoad: (maps: MapData[], message: string) => void; onStatus: (message: string, error?: boolean) => void };

const formatEnd = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// Matchs tier 1 terminés, servis par le serveur (bo3.gg). Un clic charge le match dans l'éditeur.
export const Bo3Matches = ({ onLoad, onStatus }: Props) => {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const list = await fetchMatches();
        if (alive) { setMatches(list.matches); setError(null); }
      } catch (err) { if (alive) setError((err as Error).message); }
      if (alive) setRefreshing(false);
    };
    run();
    return () => { alive = false; };
  }, [reload]);

  const refresh = () => { setRefreshing(true); setReload((n) => n + 1); };

  const load = async (m: MatchSummary) => {
    setLoadingSlug(m.slug);
    onStatus(`Récupération de ${m.teams[0].name} – ${m.teams[1].name}…`);
    try {
      const r = await fetchMatchMaps(m.slug);
      if (r.ready) onLoad(r.maps, `Match chargé : ${m.teams[0].name} ${m.teams[0].score}–${m.teams[1].score} ${m.teams[1].name}, ${r.maps.length} map${r.maps.length > 1 ? 's' : ''}.`);
      else onStatus(`Pas encore disponible : ${r.reason}. bo3.gg publie les rounds 10 à 20 min après la fin.`, true);
    } catch (err) { onStatus((err as Error).message, true); }
    setLoadingSlug(null);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Matchs tier 1 récents</h2>
        <Button variant="ghost" size="icon-sm" onClick={refresh} disabled={refreshing} aria-label="Rafraîchir la liste">
          <RefreshCw className="data-[spin=true]:animate-spin" data-spin={refreshing} />
        </Button>
      </div>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      {!error && !refreshing && !matches.length && <p className="text-[13px] text-muted-foreground">Aucun match terminé pour l’instant.</p>}
      <ScrollArea className="h-72 rounded-md border bg-muted">
        <ul className="grid">
          {matches.map((m) => (
            <li key={m.id} className="flex items-center border-b last:border-b-0">
              <button type="button" className="grid min-w-0 flex-1 gap-px px-2.5 py-2 text-left hover:bg-card disabled:opacity-60" onClick={() => load(m)} disabled={loadingSlug !== null}>
                <span className="truncate font-semibold">{m.teams[0].name} {m.teams[0].score}–{m.teams[1].score} {m.teams[1].name}</span>
                <span className="truncate text-xs text-muted-foreground">{loadingSlug === m.slug ? 'chargement…' : `${m.event} · BO${m.bo} · ${formatEnd(m.endedAt)}`}</span>
              </button>
              {m.poster && (
                <Badge asChild variant="outline" className="mr-2">
                  <a href={m.poster} target="_blank" rel="noreferrer" aria-label="Voir le poster rendu par le serveur"><ImageIcon /> poster</a>
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </section>
  );
};
