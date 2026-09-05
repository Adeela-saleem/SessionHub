import type { GeneratedPaper, GeneratedPaperQuestion, PaperDataTable } from '../../lib/types';
import { Button, Input, NumberInput, Textarea } from '../../components/ui';
import { IconPlus, IconTrash } from '../../components/icons';

/* ============================================================
   Paper editor
   The generated text is a draft; this is where the teacher
   rewrites it. Everything printed from the model — heading,
   scenario, data table, subpart text, estimated time — can be
   changed here. The marking scheme (labels, marks, CLO, BTL)
   is not edited here: it lives in the question setup on the
   left, and the sheet follows it live.
   ============================================================ */

const blankTable = (): PaperDataTable => ({
  caption: '', columns: ['Item', 'Value'], rows: [['', ''], ['', '']],
});

export function PaperEditor({ paper, onChange }: {
  paper: GeneratedPaper;
  onChange: (questions: GeneratedPaperQuestion[]) => void;
}) {
  const lab = paper.fields.paperType === 'LAB';

  const update = (qi: number, patch: Partial<GeneratedPaperQuestion>) =>
    onChange(paper.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const setTable = (qi: number, table: PaperDataTable | null) => update(qi, { dataTable: table });

  return (
    <ol className="paper-edit">
      {paper.questions.map((q, qi) => {
        const cfg = paper.questionConfig[qi];
        const table = q.dataTable ?? null;
        return (
          <li className="paper-edit-q" key={q.questionNumber}>
            <div className="paper-edit-head">
              <span className="lq-key t-num">{cfg?.num ?? qi + 1}</span>
              <span className="t-caption t-muted grow">
                {lab ? 'LLO' : 'CLO'} {cfg?.clo} · BTL {cfg?.btl} · {cfg?.parts.reduce((s, p) => s + p.marks, 0)} marks
              </span>
              <label className="paper-edit-time">
                <span className="t-caption t-muted">Est. time</span>
                <NumberInput
                  min={1} max={600}
                  aria-label={`Question ${qi + 1} estimated minutes`}
                  value={q.estimatedTimeMinutes}
                  onChange={(e) => update(qi, { estimatedTimeMinutes: Math.max(1, Number(e.target.value) || 1) })}
                />
                <span className="t-caption t-muted">min</span>
              </label>
            </div>

            {!lab && (
              <Input
                aria-label={`Question ${qi + 1} heading`}
                placeholder="Heading printed under the question line (optional)"
                value={q.title ?? ''}
                onChange={(e) => update(qi, { title: e.target.value })}
              />
            )}

            <Textarea
              aria-label={`Question ${qi + 1} ${lab ? 'problem statement' : 'scenario'}`}
              placeholder={lab ? 'Problem statement' : 'Scenario'}
              rows={Math.min(10, Math.max(3, Math.ceil(q.scenario.length / 90)))}
              value={q.scenario}
              onChange={(e) => update(qi, { scenario: e.target.value })}
            />

            {/* ── Data table ─────────────────────────────── */}
            {table ? (
              <div className="paper-edit-table">
                <div className="paper-edit-table-bar">
                  <Input
                    aria-label={`Question ${qi + 1} table caption`}
                    placeholder="Sentence introducing the table (optional)"
                    value={table.caption ?? ''}
                    onChange={(e) => setTable(qi, { ...table, caption: e.target.value })}
                  />
                  <Button size="xs" variant="secondary"
                    disabled={table.columns.length >= 6}
                    onClick={() => setTable(qi, {
                      ...table,
                      columns: [...table.columns, `Col ${table.columns.length + 1}`],
                      rows: table.rows.map((r) => [...r, '']),
                    })}>
                    <IconPlus size={12} />Column
                  </Button>
                  <Button size="xs" variant="secondary"
                    disabled={table.rows.length >= 12}
                    onClick={() => setTable(qi, { ...table, rows: [...table.rows, table.columns.map(() => '')] })}>
                    <IconPlus size={12} />Row
                  </Button>
                  <Button size="xs" variant="danger" onClick={() => setTable(qi, null)}
                    aria-label={`Remove question ${qi + 1} table`}>
                    <IconTrash size={12} />
                  </Button>
                </div>
                <div className="paper-edit-grid" style={{ gridTemplateColumns: `repeat(${table.columns.length}, minmax(0, 1fr)) 28px` }}>
                  {table.columns.map((c, ci) => (
                    <Input key={`h${ci}`} className="is-head"
                      aria-label={`Column ${ci + 1} heading`} value={c}
                      onChange={(e) => setTable(qi, {
                        ...table, columns: table.columns.map((x, i) => (i === ci ? e.target.value : x)),
                      })} />
                  ))}
                  <button type="button" className="paper-edit-cell-btn"
                    aria-label="Remove last column"
                    disabled={table.columns.length <= 2}
                    onClick={() => setTable(qi, {
                      ...table,
                      columns: table.columns.slice(0, -1),
                      rows: table.rows.map((r) => r.slice(0, -1)),
                    })}>
                    <IconTrash size={12} />
                  </button>
                  {table.rows.map((row, ri) => (
                    <RowCells key={ri} row={row} cols={table.columns.length} ri={ri}
                      canRemove={table.rows.length > 1}
                      onCell={(ci, v) => setTable(qi, {
                        ...table,
                        rows: table.rows.map((r, i) => (i === ri ? r.map((x, j) => (j === ci ? v : x)) : r)),
                      })}
                      onRemove={() => setTable(qi, { ...table, rows: table.rows.filter((_, i) => i !== ri) })}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <Button size="xs" variant="tertiary" onClick={() => setTable(qi, blankTable())}>
                  <IconPlus size={12} />Add a data table
                </Button>
              </div>
            )}

            {/* ── Subparts / tasks ───────────────────────── */}
            <ul className="paper-edit-parts">
              {q.subparts.map((sp, pi) => (
                <li key={sp.label}>
                  <span className="lq-key">{sp.label}</span>
                  <Textarea
                    aria-label={`Question ${qi + 1} part ${sp.label}`}
                    rows={Math.min(6, Math.max(1, Math.ceil(sp.text.length / 90)))}
                    value={sp.text}
                    onChange={(e) => update(qi, {
                      subparts: q.subparts.map((s, i) => (i === pi ? { ...s, text: e.target.value } : s)),
                    })}
                  />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function RowCells({ row, cols, ri, canRemove, onCell, onRemove }: {
  row: string[]; cols: number; ri: number; canRemove: boolean;
  onCell: (ci: number, v: string) => void; onRemove: () => void;
}) {
  return (
    <>
      {Array.from({ length: cols }, (_, ci) => (
        <Input key={ci} aria-label={`Row ${ri + 1} column ${ci + 1}`}
          value={row[ci] ?? ''} onChange={(e) => onCell(ci, e.target.value)} />
      ))}
      <button type="button" className="paper-edit-cell-btn" aria-label={`Remove row ${ri + 1}`}
        disabled={!canRemove} onClick={onRemove}>
        <IconTrash size={12} />
      </button>
    </>
  );
}
