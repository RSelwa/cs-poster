// Appels à l'API du serveur (server/index.ts). En dev, Vite les redirige vers le serveur.
import type { MatchList, MatchMaps } from '@/lib/api-types.ts';

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try { res = await fetch(url); } catch { throw new Error('Serveur injoignable : lance pnpm dev.'); }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || (res.status === 404 || res.status >= 502 ? 'Serveur injoignable : lance pnpm dev.' : `Erreur ${res.status}`));
  }
  return res.json() as Promise<T>;
}

export const fetchMatches = () => getJson<MatchList>('/api/matches');
export const fetchMatchMaps = (slug: string) => getJson<MatchMaps>(`/api/matches/${encodeURIComponent(slug)}`);
