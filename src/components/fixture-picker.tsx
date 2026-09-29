import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MapData } from '@/core/types.ts';
import { FIXTURES } from '@/lib/fixtures.ts';

type Props = { onLoad: (maps: MapData[], message: string) => void };

// Matchs fictifs pour régler le rendu sur des scénarios connus (remontée, double prolongation, BO5…).
export const FixturePicker = ({ onLoad }: Props) => {
  const [index, setIndex] = useState<number | null>(null);
  if (!FIXTURES.length) return null;

  const pick = (i: number) => {
    const f = FIXTURES[i];
    setIndex(i);
    onLoad(f.maps, `${f.file} chargé : ${f.maps.length} map${f.maps.length > 1 ? 's' : ''}.`);
  };
  const step = (delta: number) => pick(index === null ? (delta > 0 ? 0 : FIXTURES.length - 1) : (index + delta + FIXTURES.length) % FIXTURES.length);

  return (
    <section>
      <h2 className="mt-6 mb-2 text-[13px] font-semibold">Matchs de test</h2>
      <div className="flex gap-2">
        <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Match de test précédent"><ChevronLeft /></Button>
        <Select value={index === null ? '' : String(index)} onValueChange={(v) => pick(Number(v))}>
          <SelectTrigger className="min-w-0 flex-1 bg-muted" aria-label="Matchs de test (données fictives)"><SelectValue placeholder="Choisir un match fictif…" /></SelectTrigger>
          <SelectContent>{FIXTURES.map((f, i) => <SelectItem key={f.file} value={String(i)}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Match de test suivant"><ChevronRight /></Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Données fictives, générées par fixtures/generate.mjs.</p>
    </section>
  );
};
