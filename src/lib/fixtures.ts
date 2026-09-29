// Matchs de test (données fictives), générés par fixtures/generate.mjs.
import type { MapData } from '@/core/types.ts';

type FixtureFile = { label: string; maps: MapData[] };

const files = import.meta.glob<FixtureFile>('/fixtures/*.json', { eager: true, import: 'default' });

export const FIXTURES = Object.entries(files)
  .map(([file, f]) => ({ file: file.split('/').pop() || file, label: f.label, maps: f.maps }))
  .sort((a, b) => a.label.localeCompare(b.label));
