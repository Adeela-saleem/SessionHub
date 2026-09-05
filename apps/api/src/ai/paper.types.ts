/* ============================================================
   Exam paper generation.
   Two sheet formats, both taken from the department's own
   sample papers (see `paper sample/` at the repo root):

     • TERMINAL — the theory paper: CLO table, instructions,
       "Question # N" with a CLO/BTL/time/marks line and
       lettered subparts.
     • LAB — the practical paper: paper-version box, marks
       breakdown, Lab Learning Outcomes table, and per question
       a long problem statement, an optional data table and a
       "You are required to:" task list.

   The division of labour is the important part:
     • The AI writes only the scenario, the optional data
       table, the question heading and the subpart text.
     • CLOs / LLOs come from the teacher's form.
     • Labels, marks, CLO and BTL come from questionConfig.
   The model is never trusted with the marking scheme.
   ============================================================ */

export type PaperType = 'TERMINAL' | 'LAB';

export interface PaperPart { label: string; marks: number }

export interface PaperQuestionConfig {
  num: number;
  /** CLO number(s) for a terminal paper, LLO number(s) for a lab paper. */
  clo: string;
  /** Bloom's taxonomy level, printed as given. */
  btl: string;
  parts: PaperPart[];
}

export interface PaperFields {
  paperType: PaperType;
  university: string;
  department: string;
  /** Printed as "Course incharge". */
  instructor: string;
  subjectName: string;
  courseCode: string;
  /** Printed as "Class" (terminal) or "Batch" (lab), e.g. "BSCS 2023". */
  program: string;
  /** Ordinal, e.g. "1st" — printed as "1st Semester …". */
  semester: string;
  section: string;
  /** Terminal papers only, e.g. "Terminal" or "Mid-term". */
  examType: string;
  examDate?: string;
  duration: string;
  totalMarks: string;
  /** Lab papers only, e.g. "Performance: 7, Lab Quiz: 5, Viva: 3". */
  marksBreakdown: string;
  /** Lab papers only — the letter in the top-right box, e.g. "A". */
  paperVersion: string;
  topics: string;
  /** CLOs for a terminal paper, LLOs for a lab paper. One per line. */
  clos: string;
  instructions: string;
}

export interface GeneratedSubpart { label: string; text: string }

/** A small table of invented data printed under a lab problem statement. */
export interface PaperDataTable {
  caption?: string;
  columns: string[];
  rows: string[][];
}

export interface GeneratedPaperQuestion {
  questionNumber: number;
  /** Short heading under the question line (terminal papers), e.g. "Design Phase". */
  title?: string;
  scenario: string;
  dataTable?: PaperDataTable | null;
  estimatedTimeMinutes: number;
  subparts: GeneratedSubpart[];
}

export interface GeneratedPaper {
  fields: PaperFields;
  questionConfig: PaperQuestionConfig[];
  questions: GeneratedPaperQuestion[];
}
