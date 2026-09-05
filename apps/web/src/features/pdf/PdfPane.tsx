import { useEffect, useMemo, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import type { DraftQuestion, GeneratedPaper } from '../../lib/types';
import { AnchorButton, Spinner } from '../../components/ui';
import { IconArrowUpRight, IconFile } from '../../components/icons';
import { PaperDocument } from './PaperDocument';
import { QuizDocument, type QuizSheet } from './QuizDocument';

/* ============================================================
   PDF pane — renders a sheet to a real PDF in the browser and
   shows it in the viewer, with a download link to the same
   bytes. This module (and react-pdf with it) is loaded lazily;
   callers pass data, not elements, so the main bundle never
   imports the renderer.
   ============================================================ */

export type PdfSource =
  | { kind: 'paper'; paper: GeneratedPaper }
  | { kind: 'quiz'; sheet: QuizSheet; questions: DraftQuestion[]; includeKey: boolean };

function build(source: PdfSource) {
  return source.kind === 'paper'
    ? <PaperDocument paper={source.paper} />
    : <QuizDocument sheet={source.sheet} questions={source.questions} includeKey={source.includeKey} />;
}

export default function PdfPane({ source, fileName, className = '' }: {
  source: PdfSource; fileName: string; className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  // Re-render only when the data changes, not on every parent render.
  const key = useMemo(() => JSON.stringify(source), [source]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError('');
    pdf(build(source)).toBlob()
      .then((blob) => {
        if (cancelled) return;
        setUrl(URL.createObjectURL(blob));
        setBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'The PDF could not be rendered.');
        setBusy(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Release the previous blob once the viewer has moved on to the next one.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return (
    <div className={`pdf-pane ${className}`.trim()}>
      <div className="pdf-pane-bar">
        <span className="pdf-pane-name t-clamp-1">
          {busy ? <><Spinner size={12} /> Rendering {fileName}…</> : fileName}
        </span>
        <AnchorButton
          size="sm" variant="secondary"
          href={url ?? '#'} target="_blank" rel="noopener"
          aria-disabled={!url || undefined}
          onClick={(e) => { if (!url) e.preventDefault(); }}
        >
          <IconArrowUpRight size={14} />Open
        </AnchorButton>
        <AnchorButton
          size="sm"
          href={url ?? '#'} download={fileName}
          aria-disabled={!url || undefined}
          onClick={(e) => { if (!url) e.preventDefault(); }}
        >
          <IconFile size={14} />Download PDF
        </AnchorButton>
      </div>
      {error ? (
        <div className="pdf-frame pdf-frame-error" role="alert">{error}</div>
      ) : (
        <iframe
          className="pdf-frame"
          title={fileName}
          src={url ? `${url}#view=FitH` : 'about:blank'}
        />
      )}
    </div>
  );
}
