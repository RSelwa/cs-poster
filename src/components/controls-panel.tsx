import { useState } from 'react';
import { ArrowLeftRight, Dices } from 'lucide-react';
import { ColorField } from '@/components/color-field.tsx';
import { ParamSlider } from '@/components/param-slider.tsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FONTS } from '@/core/fonts.ts';
import { computeDrama } from '@/core/match.ts';
import { renderPoster, type BgText, type PosterParams, type Theme } from '@/core/render.ts';
import type { Match } from '@/core/types.ts';
import { download } from '@/lib/download.ts';

type NumericKey = { [K in keyof PosterParams]: PosterParams[K] extends number ? K : never }[keyof PosterParams];
type BooleanKey = 'showGrid' | 'showBgData' | 'showText' | 'showLines' | 'showMapScores';
type SliderDef = [NumericKey, string, number, number, number];

const SLIDERS: [string, SliderDef[]][] = [
  ['Grille', [['cols', 'Colonnes', 4, 14, 1], ['rows', 'Lignes', 6, 36, 1]]],
  ['Traits', [['strokes', 'Traits par kill', 0.5, 8, 0.1], ['brush', 'Épaisseur du pinceau', 0.01, 0.15, 0.002], ['grain', 'Grain', 0.3, 2.5, 0.1], ['blend', 'Mélange des encres', 0, 1.5, 0.05], ['dominance', 'Domination', 0, 4, 0.1]]],
  ['Champ de forces', [['noise', 'Ondulation', 0, 1.2, 0.01], ['noiseScale', 'Échelle des ondulations', 0.5, 6, 0.1], ['gravity', 'Gravité des rounds clés', 0, 2.5, 0.05], ['swirl', 'Tourbillon', 0, 2, 0.05], ['streakMin', 'Série minimale cassée', 3, 8, 1]]],
  ['Scores des maps', [['mapScoreSize', 'Taille des scores', 0.002, 0.02, 0.001]]],
];
const TOGGLES: [BooleanKey, string][] = [['showGrid', 'Grille chrono'], ['showBgData', 'Texte en fond'], ['showText', 'Texte'], ['showLines', 'Traits sans peinture (debug)'], ['showMapScores', 'Scores des maps']];
const BG_TEXTS: [BgText, string][] = [['small', 'Petit'], ['large', 'Grand']];
const EXPORT_SIZES = [['1800', '1800 × 2400 px (écran)'], ['3000', '3000 × 4000 px'], ['3540', '3540 × 4720 px (30 × 40 cm, 300 dpi)']];
const MAX_SEED = 9999;

type Props = { match: Match; params: PosterParams; onChange: (patch: Partial<PosterParams>) => void };

const SectionTitle = ({ children }: { children: string }) => <h2 className="mt-6 mb-2 text-[13px] font-semibold">{children}</h2>;

export const ControlsPanel = ({ match, params, onChange }: Props) => {
  const [size, setSize] = useState('3540');
  const [exporting, setExporting] = useState(false);
  const drama = params.dramaAuto ? computeDrama(match) : params.drama;

  const exportPng = async () => {
    setExporting(true);
    await new Promise((r) => setTimeout(r, 60));
    const W = Number(size), c = document.createElement('canvas');
    c.width = W; c.height = Math.round((W * 4) / 3);
    renderPoster(c.getContext('2d')!, c.width, c.height, match, params, FONTS);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (blob) download(blob, `${match.teams[0].name}-${match.teams[0].score}-${match.teams[1].score}-${match.teams[1].name}-${W}px.png`);
    setExporting(false);
  };

  return (
    <div className="[&>h2:first-child]:mt-0">
      <SectionTitle>Couleurs</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {match.teams.map((t, i) => (
          <ColorField key={i} label={t.name} value={params.colors[i]}
            onChange={(hex) => onChange({ colors: i === 0 ? [hex, params.colors[1]] : [params.colors[0], hex] })} />
        ))}
      </div>
      <div className="mt-2.5 flex gap-2">
        <ToggleGroup type="single" variant="outline" className="flex-1" value={params.theme} onValueChange={(v) => v && onChange({ theme: v as Theme })} aria-label="Fond">
          <ToggleGroupItem value="paper" className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Papier</ToggleGroupItem>
          <ToggleGroupItem value="ink" className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Encre</ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" onClick={() => onChange({ colors: [params.colors[1], params.colors[0]] })}><ArrowLeftRight /> Inverser</Button>
      </div>

      {SLIDERS.map(([title, items]) => (
        <section key={title}>
          <SectionTitle>{title}</SectionTitle>
          {items.map(([k, label, min, max, step]) => (
            <ParamSlider key={k} id={`s-${k}`} label={label} value={params[k]} min={min} max={max} step={step} onChange={(v) => onChange({ [k]: v })} />
          ))}
          {title === 'Champ de forces' && (
            <>
              <div className="flex items-center gap-2 py-2">
                <Switch id="dramaAuto" checked={params.dramaAuto} onCheckedChange={(v) => onChange(v ? { dramaAuto: true } : { dramaAuto: false, drama })} />
                <Label htmlFor="dramaAuto" className="font-normal">Drame calculé depuis le match</Label>
              </div>
              <ParamSlider id="s-drama" label="Drame" value={drama} min={0} max={1} step={0.01} disabled={params.dramaAuto} onChange={(v) => onChange({ drama: v })} />
            </>
          )}
        </section>
      ))}

      <SectionTitle>Calques</SectionTitle>
      {TOGGLES.map(([k, label]) => (
        <div key={k} className="flex items-center gap-2 py-1.5">
          <Switch id={`t-${k}`} checked={params[k]} onCheckedChange={(v) => onChange({ [k]: v })} />
          <Label htmlFor={`t-${k}`} className="font-normal">{label}</Label>
        </div>
      ))}
      <ToggleGroup type="single" variant="outline" className="mt-1 w-full" value={params.bgText} disabled={!params.showBgData} onValueChange={(v) => v && onChange({ bgText: v as BgText })} aria-label="Texte en fond">
        {BG_TEXTS.map(([v, label]) => <ToggleGroupItem key={v} value={v} className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{label}</ToggleGroupItem>)}
      </ToggleGroup>

      <SectionTitle>Tirage</SectionTitle>
      <div className="flex gap-2">
        <Input type="number" min={0} step={1} aria-label="Graine" className="bg-muted" value={params.seed}
          onChange={(e) => onChange({ seed: Math.max(0, Number.parseInt(e.target.value || '0', 10)) })} />
        <Button variant="outline" onClick={() => onChange({ seed: Math.floor(Math.random() * MAX_SEED) })}><Dices /> Autre tirage</Button>
      </div>

      <Separator className="my-5" />
      <div className="grid gap-2">
        <Select value={size} onValueChange={setSize}>
          <SelectTrigger className="w-full bg-muted" aria-label="Taille de l’export"><SelectValue /></SelectTrigger>
          <SelectContent>{EXPORT_SIZES.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={exportPng} disabled={exporting}>{exporting ? 'Rendu en cours…' : 'Exporter en PNG'}</Button>
      </div>
    </div>
  );
};
