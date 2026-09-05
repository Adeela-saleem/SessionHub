import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { DraftQuestion } from '../../lib/types';
import { pdfSafe as t } from './pdfText';

/* ============================================================
   Quiz as a printable sheet.
   Same header treatment as the terminal exam paper so a quiz
   handed out on paper looks like it came from the same
   department. The answer key, when asked for, is its own page
   at the end so the question pages can be photocopied alone.
   ============================================================ */

export interface QuizSheet {
  title: string;
  university: string;
  course: string;
  program: string;
  date: string;
  duration: string;
  instructions: string;
}

const SERIF = 'Times-Roman';
const SERIF_BOLD = 'Times-Bold';

const s = StyleSheet.create({
  page: {
    paddingTop: 40, paddingBottom: 48, paddingLeft: 58, paddingRight: 50,
    fontFamily: SERIF, fontSize: 12, color: '#000',
  },
  // Line height lives here, not on the Page: react-pdf drops the
  // render-prop footer when it inherits a unitless lineHeight.
  body: { fontSize: 12, lineHeight: 1.35 },
  bold: { fontFamily: SERIF_BOLD },
  title: { fontFamily: SERIF_BOLD, fontSize: 12, textAlign: 'center', textTransform: 'uppercase' },
  metaBox: {
    marginTop: 12, borderWidth: 1, borderColor: '#000', borderStyle: 'solid',
    paddingVertical: 6, paddingHorizontal: 8,
  },
  metaRow: { flexDirection: 'row' },
  metaLeft: { flex: 1.55, fontFamily: SERIF_BOLD },
  metaRight: { flex: 1, fontFamily: SERIF_BOLD },
  underline: { textDecoration: 'underline' },
  nameRow: { flexDirection: 'row', marginTop: 10, fontFamily: SERIF_BOLD },
  instrHead: { marginTop: 8, fontFamily: SERIF_BOLD },
  instrLine: { fontSize: 10 },
  question: { marginTop: 12 },
  qRow: { flexDirection: 'row', alignItems: 'flex-start' },
  qNum: { width: 30, fontFamily: SERIF_BOLD },
  qText: { flex: 1, textAlign: 'justify' },
  qMarks: { width: 64, textAlign: 'right', fontSize: 10, paddingTop: 2 },
  options: { marginLeft: 30, marginTop: 3 },
  optionsGrid: { marginLeft: 30, marginTop: 3, flexDirection: 'row', flexWrap: 'wrap' },
  option: { flexDirection: 'row', marginBottom: 1 },
  optionHalf: { flexDirection: 'row', marginBottom: 1, width: '50%', paddingRight: 8 },
  optionKey: { width: 22 },
  optionText: { flex: 1 },
  rule: {
    marginLeft: 30, marginTop: 14, borderBottomWidth: 0.6, borderColor: '#000', borderStyle: 'solid',
  },
  keyTitle: { fontFamily: SERIF_BOLD, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  keyTable: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#000', borderStyle: 'solid' },
  keyRow: { flexDirection: 'row' },
  keyCell: {
    paddingVertical: 3, paddingHorizontal: 6, fontSize: 11,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', borderStyle: 'solid',
  },
  keyQ: { width: 40, fontFamily: SERIF_BOLD },
  keyAns: { width: 150 },
  keyWhy: { flex: 1 },
  footer: {
    position: 'absolute', bottom: 24, right: 48,
    fontFamily: 'Helvetica', fontSize: 10, color: '#000',
  },
});

const letter = (i: number) => String.fromCharCode(65 + i);
const lines = (block: string) => block.split('\n').map((l) => l.trim()).filter(Boolean);

function longDate(iso: string) {
  if (!iso) return '____________';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function Footer() {
  return (
    <Text fixed style={s.footer} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  );
}

export function QuizDocument({ sheet, questions, includeKey }: {
  sheet: QuizSheet; questions: DraftQuestion[]; includeKey: boolean;
}) {
  const total = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
  const instructions = lines(sheet.instructions);
  const title = sheet.title || 'Quiz';

  return (
    <Document title={t(title)} creator="SessionHub">
      <Page size="LETTER" style={s.page}>
        <Footer />
        <View style={s.body}>
        {sheet.university ? <Text style={s.title}>{t(sheet.university)}</Text> : null}
        <Text style={s.title}>{t(title)}</Text>

        <View style={s.metaBox}>
          <View style={s.metaRow}>
            <Text style={s.metaLeft}>COURSE: <Text style={s.underline}>{t(sheet.course || '—')}</Text></Text>
            <Text style={s.metaRight}>CLASS: <Text style={s.underline}>{t(sheet.program || '—')}</Text></Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLeft}>DATE: <Text style={s.underline}>{t(longDate(sheet.date))}</Text></Text>
            <Text style={s.metaRight}>TIME: <Text style={s.underline}>{t(sheet.duration || '—')}</Text></Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLeft}>TOTAL MARKS: <Text style={s.underline}>{total}</Text></Text>
            <Text style={s.metaRight}>QUESTIONS: <Text style={s.underline}>{questions.length}</Text></Text>
          </View>
          <View style={s.nameRow}>
            <Text style={{ flex: 1.55 }}>NAME: ________________________________</Text>
            <Text style={{ flex: 1 }}>ROLL NO: ______________</Text>
          </View>
        </View>

        {instructions.length > 0 && (
          <View>
            <Text style={s.instrHead}>Instructions:</Text>
            {instructions.map((l, i) => <Text style={s.instrLine} key={i}>{t(l)}</Text>)}
          </View>
        )}

        {questions.map((q, i) => {
          const mcq = q.options.length > 0;
          const compact = mcq && q.options.every((o) => o.length <= 28);
          return (
            <View style={s.question} key={i} minPresenceAhead={60}>
              <View style={s.qRow} wrap={false}>
                <Text style={s.qNum}>Q{i + 1}.</Text>
                <Text style={s.qText}>{t(q.prompt)}</Text>
                <Text style={s.qMarks}>[{q.marks} {q.marks === 1 ? 'mark' : 'marks'}]</Text>
              </View>
              {mcq ? (
                <View style={compact ? s.optionsGrid : s.options}>
                  {q.options.map((o, j) => (
                    <View style={compact ? s.optionHalf : s.option} key={j}>
                      <Text style={s.optionKey}>{letter(j)}.</Text>
                      <Text style={s.optionText}>{t(o)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View>
                  <View style={s.rule} />
                  <View style={s.rule} />
                  <View style={s.rule} />
                </View>
              )}
            </View>
          );
        })}
        </View>
      </Page>

      {includeKey && (
        <Page size="LETTER" style={s.page}>
          <Footer />
          <View style={s.body}>
          <Text style={s.keyTitle}>ANSWER KEY — {t(title)}</Text>
          <View style={s.keyTable}>
            <View style={s.keyRow}>
              <Text style={[s.keyCell, s.keyQ]}>Q</Text>
              <Text style={[s.keyCell, s.keyAns, s.bold]}>Answer</Text>
              <Text style={[s.keyCell, s.keyWhy, s.bold]}>Explanation</Text>
            </View>
            {questions.map((q, i) => {
              const answer = q.options.length > 0 && q.correctIndex !== null && q.correctIndex !== undefined
                ? `${letter(q.correctIndex)}. ${q.options[q.correctIndex] ?? ''}`
                : 'Open answer — marked by hand';
              return (
                <View style={s.keyRow} key={i} wrap={false}>
                  <Text style={[s.keyCell, s.keyQ]}>{i + 1}</Text>
                  <Text style={[s.keyCell, s.keyAns]}>{t(answer)}</Text>
                  <Text style={[s.keyCell, s.keyWhy]}>{t(q.explanation ?? '')}</Text>
                </View>
              );
            })}
          </View>
          </View>
        </Page>
      )}
    </Document>
  );
}
