import { useEffect, useRef, useState } from 'react';

type Props = { onFiles: (files: File[]) => void };

// Dépôt de fichiers JSON : sur la zone, ou n'importe où dans la page.
export const ImportZone = ({ onFiles }: Props) => {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer?.files.length) onFiles([...e.dataTransfer.files]); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', drop); };
  }, [onFiles]);

  return (
    <>
      <button type="button" data-over={over} onClick={() => input.current?.click()}
        onDragEnter={() => setOver(true)} onDragOver={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}
        className="w-full cursor-pointer rounded-md border border-dashed border-muted-foreground/60 px-3 py-3.5 text-center text-muted-foreground hover:border-foreground hover:bg-muted hover:text-foreground data-[over=true]:border-foreground data-[over=true]:bg-muted data-[over=true]:text-foreground">
        Déposer un .json exporté<br /><small>plusieurs fichiers à la fois, regroupés par match</small>
      </button>
      <input ref={input} type="file" accept=".json" multiple hidden onChange={(e) => { onFiles([...(e.target.files || [])]); e.target.value = ''; }} />
    </>
  );
};
