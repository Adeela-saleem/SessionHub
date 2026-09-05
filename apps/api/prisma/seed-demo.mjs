// Generates a few weeks of plausible session history so the dashboards
// have something to plot. Idempotent-ish: skips if history already exists.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (xs) => xs[rand(0, xs.length - 1)];

const TOPICS = [
  ['Which normal form removes transitive dependency?', ['1NF','2NF','3NF','BCNF'], 2],
  ['What does ACID stand for in transactions?', ['Atomicity, Consistency, Isolation, Durability','Access, Control, Index, Data','Atomic, Cached, Indexed, Durable','Aggregate, Commit, Isolate, Delete'], 0],
  ['Which index type suits range queries best?', ['Hash','B-tree','Bitmap','Inverted'], 1],
  ['What isolation level prevents phantom reads?', ['Read Committed','Repeatable Read','Serializable','Read Uncommitted'], 2],
  ['A foreign key enforces which property?', ['Atomicity','Referential integrity','Durability','Normalisation'], 1],
  ['Which join returns unmatched rows from both sides?', ['INNER','LEFT','FULL OUTER','CROSS'], 2],
];

const existing = await db.classSession.count();
if (existing > 6) {
  console.log(`History already present (${existing} sessions) — skipping.`);
  await db.$disconnect();
  process.exit(0);
}

const teacher = await db.user.findUnique({ where: { email: 'teacher@sessionhub.edu' } });
const course  = await db.course.findUnique({ where: { code: 'CS-204' } });
const students = await db.user.findMany({ where: { role: 'STUDENT' } });
if (!teacher || !course || !students.length) throw new Error('Run the base seed first');

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codeFor = () => Array.from({length:6}, () => ALPHA[rand(0, ALPHA.length-1)]).join('');

let made = 0;
for (let d = 12; d >= 1; d--) {
  if (d % 2 === 0) continue;                       // lectures every other day
  const day = new Date(Date.now() - d * 86_400_000);

  const session = await db.classSession.create({
    data: {
      roomCode: codeFor(), title: `Lecture ${13 - d}`,
      courseId: course.id, teacherId: teacher.id,
      status: 'CLOSED', startedAt: day, endedAt: new Date(day.getTime() + 50*60_000),
      createdAt: day, lastTeacherPingAt: day,
    },
  });

  // Attendance: most of the class, not all
  const present = students.slice(0, rand(Math.max(1, students.length - 1), students.length));
  for (const s of present) {
    await db.attendance.create({
      data: { sessionId: session.id, studentId: s.id, joinedAt: day,
              leftAt: new Date(day.getTime() + 48*60_000) },
    });
  }

  // Two or three questions, with answers whose accuracy drifts upward over
  // the term so the trend line is not flat noise.
  const nQ = rand(2, 3);
  for (let q = 1; q <= nQ; q++) {
    const [prompt, options, correct] = pick(TOPICS);
    const question = await db.question.create({
      data: {
        sessionId: session.id, order: q, prompt, type: 'MCQ', options,
        marks: rand(1, 3), state: 'CLOSED', durationSeconds: 45,
        openedAt: day, closesAt: new Date(day.getTime() + 45_000),
        closedAt: new Date(day.getTime() + 60_000), createdAt: day,
        key: { create: { correctIndex: correct, explanation: 'Reviewed in the lecture recording.' } },
      },
    });

    const skill = 0.45 + (12 - d) * 0.035;          // improves through the term
    for (const s of present) {
      if (Math.random() > 0.92) continue;            // a few never answer
      const right = Math.random() < skill;
      const answerIndex = right ? correct : pick([...options.keys()].filter((i) => i !== correct));
      await db.answer.create({
        data: {
          questionId: question.id, studentId: s.id, answerIndex,
          isCorrect: right, marksAwarded: right ? question.marks : 0, answeredAt: day,
        },
      });
    }
  }
  made++;
}

console.log(`Generated ${made} historical sessions with questions, attendance and answers.`);
await db.$disconnect();
