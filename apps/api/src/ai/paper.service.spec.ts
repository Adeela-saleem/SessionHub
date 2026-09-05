import { AiService } from './ai.service';
import type { PaperQuestionConfig } from './paper.types';

/**
 * The marking scheme is the teacher's, not the model's. These tests pin
 * that contract: whatever the AI returns, labels and marks come from
 * questionConfig, so a drifting model cannot silently re-weight a paper.
 */
describe('AiService — paper normalisation', () => {
  const service = new AiService({ get: () => undefined } as never);
  // normalisePaper is private by design; exercised through its real name.
  const normalise = (raw: unknown, cfg: PaperQuestionConfig[]) =>
    (service as unknown as { normalisePaper: (r: unknown, c: PaperQuestionConfig[]) => unknown })
      .normalisePaper(raw, cfg);

  const config: PaperQuestionConfig[] = [
    { num: 1, clo: '1', btl: 'C3', parts: [{ label: 'a', marks: 5 }, { label: 'b', marks: 5 }] },
    { num: 2, clo: '2', btl: 'C4', parts: [{ label: 'a', marks: 10 }] },
  ];

  it('keeps the teacher’s labels even when the model invents its own', () => {
    const out = normalise({
      questions: [
        { questionNumber: 1, scenario: 'A hospital system.', estimatedTimeMinutes: 30,
          subparts: [{ label: 'i', text: 'First' }, { label: 'ii', text: 'Second' }] },
        { questionNumber: 2, scenario: 'An airline platform.', estimatedTimeMinutes: 25,
          subparts: [{ label: 'z', text: 'Only' }] },
      ],
    }, config) as { subparts: { label: string }[] }[];

    expect(out[0]!.subparts.map((s) => s.label)).toEqual(['a', 'b']);
    expect(out[1]!.subparts.map((s) => s.label)).toEqual(['a']);
  });

  it('matches subparts by label before falling back to position', () => {
    const out = normalise({
      questions: [{
        questionNumber: 1, scenario: 'S', estimatedTimeMinutes: 20,
        subparts: [{ label: 'b', text: 'Bee' }, { label: 'a', text: 'Ay' }],
      }],
    }, [config[0]!]) as { subparts: { label: string; text: string }[] }[];

    expect(out[0]!.subparts).toEqual([
      { label: 'a', text: 'Ay' },
      { label: 'b', text: 'Bee' },
    ]);
  });

  it('accepts the alternative keys the model sometimes uses', () => {
    const out = normalise({
      questions: [{ questionNumber: 1, context: 'From context', estimatedTime: 40,
        parts: [{ label: 'a', content: 'From content' }, { label: 'b', question: 'From question' }] }],
    }, [config[0]!]) as { scenario: string; estimatedTimeMinutes: number; subparts: { text: string }[] }[];

    expect(out[0]!.scenario).toBe('From context');
    expect(out[0]!.estimatedTimeMinutes).toBe(40);
    expect(out[0]!.subparts.map((s) => s.text)).toEqual(['From content', 'From question']);
  });

  it('substitutes placeholder text rather than emitting an empty subpart', () => {
    const out = normalise({
      questions: [{ questionNumber: 1, scenario: 'S', subparts: [] }],
    }, [config[0]!]) as { subparts: { text: string }[]; estimatedTimeMinutes: number }[];

    expect(out[0]!.subparts).toHaveLength(2);
    expect(out[0]!.subparts[0]!.text).toContain('(a)');
    expect(out[0]!.estimatedTimeMinutes).toBe(15); // documented default
  });

  it('rejects a reply with no questions instead of returning an empty paper', () => {
    expect(() => normalise({ questions: [] }, config)).toThrow();
    expect(() => normalise('nonsense', config)).toThrow();
  });

  it('keeps a well-formed data table and the question heading', () => {
    const out = normalise({
      questions: [{
        questionNumber: 1, title: 'Route Planning', scenario: 'S', estimatedTimeMinutes: 30,
        dataTable: { caption: 'Walking times:', columns: ['From', 'To', 'Min'], rows: [['A', 'B', 10], ['B', 'C']] },
        subparts: [{ label: 'a', text: 'Do' }, { label: 'b', text: 'Explain' }],
      }],
    }, [config[0]!]) as { title?: string; dataTable: { caption?: string; columns: string[]; rows: string[][] } | null }[];

    expect(out[0]!.title).toBe('Route Planning');
    expect(out[0]!.dataTable).toEqual({
      caption: 'Walking times:',
      columns: ['From', 'To', 'Min'],
      // Numbers become strings; a short row is padded to the column count.
      rows: [['A', 'B', '10'], ['B', 'C', '']],
    });
  });

  it('drops a data table it cannot print rather than failing the paper', () => {
    const out = normalise({
      questions: [
        { questionNumber: 1, scenario: 'S', dataTable: { columns: ['Only'], rows: [['x']] }, subparts: [] },
        { questionNumber: 2, scenario: 'S', dataTable: 'not a table', subparts: [] },
      ],
    }, config) as { dataTable: unknown }[];

    expect(out[0]!.dataTable).toBeNull();
    expect(out[1]!.dataTable).toBeNull();
  });
});
