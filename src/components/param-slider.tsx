import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

type Props = { id: string; label: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (v: number) => void };

const format = (v: number, step: number) => (step >= 1 ? String(v) : v.toFixed(step < 0.01 ? 3 : 2));

export const ParamSlider = ({ id, label, value, min, max, step, disabled, onChange }: Props) => (
  <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 py-1.5 has-data-disabled:opacity-45">
    <Label htmlFor={id} className="font-normal">{label}</Label>
    <output htmlFor={id} className="font-mono text-xs text-muted-foreground">{format(value, step)}</output>
    <Slider id={id} className="col-span-2" value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={([v]) => onChange(v)} />
  </div>
);
