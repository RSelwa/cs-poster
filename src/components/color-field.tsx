import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';

// '#1f5fa8', '1F5FA8', '#abc' → '#1f5fa8' / '#aabbcc' ; autre chose → null
const parseHex = (text: string) => {
  const h = text.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) return `#${[...h].map((c) => c + c).join('')}`;
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
};

type Props = { label: string; value: string; onChange: (hex: string) => void };

// Couleur d'une équipe : pastille (sélecteur du système) + code hex saisi ou collé.
// Pendant la saisie, le texte reste tel quel ; il s'applique dès qu'il forme un code valide.
export const ColorField = ({ label, value, onChange }: Props) => {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const isInvalid = draft !== null && parseHex(draft) === null;

  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className="truncate text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-1.5">
        <input type="color" aria-label={`${label} : sélecteur`} className="size-8 shrink-0 cursor-pointer rounded-md border bg-muted p-0.5" value={value} onChange={(e) => onChange(e.target.value)} />
        <Input id={id} spellCheck={false} autoComplete="off" aria-invalid={isInvalid} className="min-w-0 bg-muted font-mono"
          value={draft ?? value}
          onChange={(e) => { setDraft(e.target.value); const hex = parseHex(e.target.value); if (hex) onChange(hex); }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </div>
    </div>
  );
};
