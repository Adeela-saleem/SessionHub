import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { GeneratedPaper, PaperDataTable, PaperFields, PaperQuestionConfig } from '../../lib/types';
import { ordinal, pdfSafe as t } from './pdfText';

/* ============================================================
   Exam paper as a PDF.
   Two layouts, each copied from the department's own sample
   sheet (repo root, `paper sample/`):
     • TerminalSheet — "Terminal SE v1.docx"
     • LabSheet      — "CS'23 Lab paper A.docx"
   Letter paper, Times, the same boxes, tables and rules. The
   sheet is a document, not a screen: nothing here is themed.
   ============================================================ */

// Word hyphenates nothing in these sheets; neither do we.
Font.registerHyphenationCallback((word) => [word]);

const SERIF = 'Times-Roman';
const SERIF_BOLD = 'Times-Bold';

const base = StyleSheet.create({
  footer: {
    position: 'absolute', bottom: 24, right: 48,
    fontFamily: 'Helvetica', fontSize: 10, color: '#000',
  },
  bold: { fontFamily: SERIF_BOLD },
  underline: { textDecoration: 'underline' },
});

/**
 * Page number. react-pdf drops a render-prop Text when it inherits a
 * unitless lineHeight from the Page, so each sheet keeps lineHeight on a
 * content wrapper and leaves the Page itself unstyled for it.
 */
function Footer() {
  return (
    <Text
      fixed
      style={base.footer}
      render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
    />
  );
}

/* ── Shared helpers ─────────────────────────────────────── */
const lines = (block: string) => block.split('\n').map((l) => l.trim()).filter(Boolean);

function examYear(fields: PaperFields) {
  const d = fields.examDate ? new Date(`${fields.examDate}T00:00:00`) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
}

function examDate(fields: PaperFields, style: 'long' | 'numeric') {
  if (!fields.examDate) return '____________';
  const d = new Date(`${fields.examDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fields.examDate;
  if (style === 'long') {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function questionTotal(cfg: PaperQuestionConfig) {
  return cfg.parts.reduce((s, p) => s + p.marks, 0);
}

/** "[2.5x4=10]" when every part carries the same marks, else "[5+3+2=10]". */
function marksFormula(cfg: PaperQuestionConfig) {
  const total = questionTotal(cfg);
  const marks = cfg.parts.map((p) => p.marks);
  if (marks.length > 1 && marks.every((m) => m === marks[0])) {
    return `[${marks[0]}x${marks.length}=${total}]`;
  }
  if (marks.length === 1) return `[${total}]`;
  return `[${marks.join('+')}=${total}]`;
}

/* ============================================================
   TERMINAL — the theory paper
   ============================================================ */
const term = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 48, paddingLeft: 58, paddingRight: 50,
    fontFamily: SERIF, fontSize: 12, color: '#000',
  },
  // fontSize is repeated here because a unitless lineHeight resolves against
  // the node's own font size, not the inherited one.
  body: { fontSize: 12, lineHeight: 1.35 },
  title: { fontFamily: SERIF_BOLD, fontSize: 12, textAlign: 'center', textTransform: 'uppercase' },
  metaBox: {
    marginTop: 12, borderWidth: 1, borderColor: '#000', borderStyle: 'solid',
    paddingVertical: 6, paddingHorizontal: 8,
  },
  metaRow: { flexDirection: 'row' },
  metaLeft: { flex: 1.9, fontFamily: SERIF_BOLD, fontSize: 12 },
  metaRight: { flex: 1, fontFamily: SERIF_BOLD, fontSize: 12 },
  cloTable: {
    marginTop: 12, borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
  cloHead: {
    fontFamily: SERIF_BOLD, fontSize: 14, paddingVertical: 2, paddingHorizontal: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
  cloRow: { flexDirection: 'row' },
  cloLabel: {
    width: 64, fontFamily: SERIF_BOLD, fontSize: 11, paddingVertical: 3, paddingHorizontal: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
  cloText: {
    flex: 1, fontSize: 11, paddingVertical: 3, paddingHorizontal: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
  instrHead: { marginTop: 6, fontFamily: SERIF_BOLD, fontSize: 12 },
  instrLine: { fontSize: 10 },
  scenarioHead: { marginTop: 10, fontFamily: SERIF_BOLD, fontSize: 12 },
  question: { marginTop: 16 },
  qHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottomWidth: 1, borderColor: '#000', borderStyle: 'solid', paddingBottom: 1,
  },
  qNum: { fontFamily: SERIF_BOLD, fontSize: 13 },
  qMeta: { fontSize: 10 },
  qTitle: { marginTop: 6, fontFamily: SERIF_BOLD, fontSize: 12 },
  scenario: { marginTop: 6, textAlign: 'justify' },
  parts: { marginTop: 6, marginLeft: 14 },
  part: { flexDirection: 'row', marginBottom: 3 },
  partLabel: { width: 20 },
  partText: { flex: 1, textAlign: 'justify' },
});

function TerminalSheet({ paper }: { paper: GeneratedPaper }) {
  const { fields: f, questionConfig, questions } = paper;
  const clos = lines(f.clos ?? '');
  const instructions = lines(f.instructions ?? '');
  const cls = [f.program, f.section ? `(${f.section})` : ''].filter(Boolean).join(' ');
  const heading = `${ordinal(f.semester ?? '')} Semester ${f.examType || 'Terminal'} Examination ${examYear(f)}`;

  return (
    <Page size="LETTER" style={term.page}>
      <Footer />
      <View style={term.body}>
      <Text style={term.title}>{t(f.university)}</Text>
      <Text style={term.title}>{t(heading)}</Text>

      <View style={term.metaBox}>
        <View style={term.metaRow}>
          <Text style={[term.metaLeft, base.underline]}>
            {t(f.department ? `Department of ${f.department}` : f.university)}
          </Text>
          <Text style={term.metaRight}>CLASS:   <Text style={base.underline}>{t(cls)}</Text></Text>
        </View>
        <View style={term.metaRow}>
          <Text style={term.metaLeft}>COURSE TITLE: <Text style={base.underline}>{t(f.subjectName)}</Text></Text>
          <Text style={term.metaRight}>DATE:     <Text style={base.underline}>{t(examDate(f, 'long'))}</Text></Text>
        </View>
        <View style={term.metaRow}>
          <Text style={term.metaLeft}>COURSE CODE:  <Text style={base.underline}>{t(f.courseCode || '—')}</Text></Text>
          <Text style={term.metaRight}>DURATION: <Text style={base.underline}>{t(f.duration)}</Text></Text>
        </View>
        <View style={term.metaRow}>
          <Text style={term.metaLeft}>COURSE INCHARGE: <Text style={base.underline}>{t(f.instructor)}</Text></Text>
          <Text style={term.metaRight}>MARKS: <Text style={base.underline}>{t(f.totalMarks)} Marks</Text></Text>
        </View>
      </View>

      {clos.length > 0 && (
        <View style={term.cloTable}>
          <Text style={term.cloHead}>Course Learning Outcomes (CLOs):</Text>
          {clos.map((c, i) => (
            <View style={term.cloRow} key={i} wrap={false}>
              <Text style={term.cloLabel}>CLO. {i + 1}</Text>
              <Text style={term.cloText}>{t(c)}</Text>
            </View>
          ))}
        </View>
      )}

      {instructions.length > 0 && (
        <View>
          <Text style={term.instrHead}>Instructions:</Text>
          {instructions.map((l, i) => <Text style={term.instrLine} key={i}>{t(l)}</Text>)}
        </View>
      )}

      {questions.map((q, qi) => {
        const cfg = questionConfig[qi];
        if (!cfg) return null;
        return (
          <View style={term.question} key={cfg.num}>
            <View style={term.qHead} minPresenceAhead={90}>
              <Text style={term.qNum}>Question # {cfg.num}</Text>
              <Text style={term.qMeta}>
                Marks: {marksFormula(cfg)} | CLO: {t(cfg.clo)} | BTL: {t(cfg.btl)} | Est. Time: {q.estimatedTimeMinutes || '—'} min
              </Text>
            </View>
            {q.title && <Text style={term.qTitle}>{t(q.title)}</Text>}
            {q.scenario && (
              <Text style={term.scenario}>
                <Text style={base.bold}>Scenario: </Text>{t(q.scenario)}
              </Text>
            )}
            {q.dataTable && <DataTable table={q.dataTable} />}
            <View style={term.parts}>
              {q.subparts.map((sp) => (
                <View style={term.part} key={sp.label} wrap={false}>
                  <Text style={term.partLabel}>{t(sp.label)}.</Text>
                  <Text style={term.partText}>{t(sp.text)}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
      </View>
    </Page>
  );
}

/* ============================================================
   LAB — the practical paper
   ============================================================ */
const lab = StyleSheet.create({
  page: {
    paddingTop: 64, paddingBottom: 60, paddingHorizontal: 72,
    fontFamily: SERIF, fontSize: 12, color: '#000',
  },
  body: { fontSize: 12, lineHeight: 1.3 },
  header: { position: 'relative', paddingTop: 6, minHeight: 56 },
  university: { fontFamily: SERIF_BOLD, fontSize: 14, textAlign: 'center' },
  heading: { fontFamily: SERIF_BOLD, fontSize: 12, textAlign: 'center', marginTop: 6 },
  versionBox: {
    position: 'absolute', right: 0, top: 0, width: 58, height: 50,
    borderWidth: 1.5, borderColor: '#70AD47', borderStyle: 'solid',
    alignItems: 'center', justifyContent: 'center',
  },
  version: { fontFamily: SERIF, fontSize: 34, lineHeight: 1 },
  metaBox: {
    marginTop: 24, borderWidth: 1, borderColor: '#000', borderStyle: 'solid',
    paddingVertical: 5, paddingHorizontal: 8,
  },
  metaRow: { flexDirection: 'row' },
  metaLeft: { flex: 2.1 },
  metaRight: { flex: 1 },
  lloTable: {
    marginTop: 16, borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
  lloCell: {
    paddingVertical: 3, paddingHorizontal: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
  instr: { marginTop: 12, fontFamily: SERIF_BOLD },
  question: { marginTop: 14 },
  qHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottomWidth: 1.5, borderColor: '#000', borderStyle: 'solid', paddingBottom: 3,
  },
  qNum: { fontFamily: SERIF_BOLD, fontSize: 12 },
  qMeta: { fontFamily: SERIF_BOLD, fontSize: 11 },
  scenario: { marginTop: 8, textAlign: 'justify' },
  required: { marginTop: 12, fontFamily: SERIF_BOLD },
  tasks: { marginTop: 4, marginLeft: 16 },
  task: { flexDirection: 'row', marginBottom: 2 },
  taskLabel: { width: 22 },
  taskText: { flex: 1, textAlign: 'justify' },
});

function LabSheet({ paper }: { paper: GeneratedPaper }) {
  const { fields: f, questionConfig, questions } = paper;
  const llos = lines(f.clos ?? '');
  const instructions = lines(f.instructions ?? '');
  const heading = `${ordinal(f.semester ?? '')} Semester Lab Examination ${examYear(f)}`;
  const marksLine = [f.totalMarks, f.marksBreakdown ? `(${f.marksBreakdown})` : ''].filter(Boolean).join(' ');
  const batch = [f.program, f.section ? `(${f.section})` : ''].filter(Boolean).join(' ');

  return (
    <Page size="LETTER" style={lab.page}>
      <Footer />
      <View style={lab.body}>
      <View style={lab.header}>
        <Text style={lab.university}>{t(f.university)}</Text>
        <Text style={lab.heading}>{t(heading)}</Text>
        {f.paperVersion ? (
          <View style={lab.versionBox}>
            <Text style={lab.version}>{t(f.paperVersion).slice(0, 2)}</Text>
          </View>
        ) : null}
      </View>

      <View style={lab.metaBox}>
        <View style={lab.metaRow}>
          <Text style={lab.metaLeft}><Text style={base.bold}>Department: </Text>{t(f.department)}</Text>
          <Text style={lab.metaRight}><Text style={base.bold}>Batch: </Text>{t(batch)}</Text>
        </View>
        <View style={lab.metaRow}>
          <Text style={lab.metaLeft}><Text style={base.bold}>Course Title: </Text>{t(f.subjectName)}</Text>
          <Text style={lab.metaRight}><Text style={base.bold}>Date: </Text>{t(examDate(f, 'numeric'))}</Text>
        </View>
        <View style={lab.metaRow}>
          <Text style={lab.metaLeft}><Text style={base.bold}>Course Code: </Text>{t(f.courseCode)}</Text>
          <Text style={lab.metaRight}><Text style={base.bold}>Duration: </Text>{t(f.duration)}</Text>
        </View>
        <Text><Text style={base.bold}>Marks: </Text>{t(marksLine)}</Text>
      </View>

      {llos.length > 0 && (
        <View style={lab.lloTable}>
          <Text style={[lab.lloCell, base.bold]}>Lab Learning Outcomes</Text>
          {llos.map((l, i) => (
            <Text style={lab.lloCell} key={i}>{i + 1}.  {t(l)}</Text>
          ))}
        </View>
      )}

      <View>
        {(instructions.length ? instructions : ['Attempt all questions:']).map((l, i) => (
          <Text style={[lab.instr, i > 0 ? { marginTop: 2 } : {}]} key={i}>{t(l)}</Text>
        ))}
      </View>

      {questions.map((q, qi) => {
        const cfg = questionConfig[qi];
        if (!cfg) return null;
        const marks = String(questionTotal(cfg)).padStart(2, '0');
        return (
          <View style={lab.question} key={cfg.num}>
            <View style={lab.qHead} minPresenceAhead={100}>
              <Text style={lab.qNum}>Question {cfg.num}:</Text>
              <Text style={lab.qMeta}>
                [LLO: {t(cfg.clo)}; BT Level: {t(cfg.btl)}; EST: {q.estimatedTimeMinutes || '—'}; Marks: {marks}]
              </Text>
            </View>
            <Text style={lab.scenario}>{t(q.scenario)}</Text>
            {q.dataTable && <DataTable table={q.dataTable} />}
            <Text style={lab.required}>You are required to:</Text>
            <View style={lab.tasks}>
              {q.subparts.map((sp) => (
                <View style={lab.task} key={sp.label} wrap={false}>
                  <Text style={lab.taskLabel}>{t(sp.label)})</Text>
                  <Text style={lab.taskText}>{t(sp.text)}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
      </View>
    </Page>
  );
}

/* ── Data table (both sheets) ───────────────────────────── */
const tbl = StyleSheet.create({
  caption: { marginTop: 8 },
  table: {
    marginTop: 8, alignSelf: 'center', width: '72%',
    borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
  row: { flexDirection: 'row' },
  cell: {
    flex: 1, textAlign: 'center', paddingVertical: 2, paddingHorizontal: 4, fontSize: 12,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
});

function DataTable({ table }: { table: PaperDataTable }) {
  return (
    <View wrap={false}>
      {table.caption && <Text style={tbl.caption}>{t(table.caption)}</Text>}
      <View style={tbl.table}>
        <View style={tbl.row}>
          {table.columns.map((c, i) => <Text style={[tbl.cell, base.bold]} key={i}>{t(c)}</Text>)}
        </View>
        {table.rows.map((r, ri) => (
          <View style={tbl.row} key={ri}>
            {table.columns.map((_, ci) => <Text style={tbl.cell} key={ci}>{t(r[ci] ?? '')}</Text>)}
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── Document ───────────────────────────────────────────── */
export function PaperDocument({ paper }: { paper: GeneratedPaper }) {
  const lab = paper.fields.paperType === 'LAB';
  const title = `${paper.fields.subjectName} — ${lab ? 'Lab Examination' : `${paper.fields.examType} Examination`}`;
  return (
    <Document title={t(title)} author={t(paper.fields.instructor)} creator="SessionHub">
      {lab ? <LabSheet paper={paper} /> : <TerminalSheet paper={paper} />}
    </Document>
  );
}
