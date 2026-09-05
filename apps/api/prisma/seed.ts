import { PrismaClient, Role, QuestionType } from '@prisma/client';
import { hash as argonHash } from '@node-rs/argon2';

const prisma = new PrismaClient();

/**
 * Development seed. The admin password is intentionally a well-known
 * value and must be changed before any real deployment.
 */
async function main() {
  const password = await argonHash('Password123!');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@sessionhub.edu' },
    update: {},
    create: {
      email: 'admin@sessionhub.edu', name: 'Super Admin',
      passwordHash: password, role: Role.ADMIN, approvalStatus: 'APPROVED',
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@sessionhub.edu' },
    update: {},
    create: {
      email: 'teacher@sessionhub.edu', name: 'Rabia Ahmed',
      passwordHash: password, role: Role.TEACHER, approvalStatus: 'APPROVED',
      department: 'Computer Science',
    },
  });

  const students = await Promise.all(
    [
      ['ada@sessionhub.edu', 'Ada Lovelace'],
      ['alan@sessionhub.edu', 'Alan Turing'],
      ['grace@sessionhub.edu', 'Grace Hopper'],
    ].map(([email, name]) =>
      prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email, name, passwordHash: password,
          role: Role.STUDENT, approvalStatus: 'APPROVED',
          department: 'Computer Science', year: 3,
        },
      }),
    ),
  );

  const course = await prisma.course.upsert({
    where: { code: 'CS-204' },
    update: {},
    create: {
      code: 'CS-204', name: 'Database Systems',
      department: 'Computer Science', teacherId: teacher.id,
    },
  });

  for (const s of students) {
    await prisma.enrollment.upsert({
      where: { courseId_studentId: { courseId: course.id, studentId: s.id } },
      update: {},
      create: { courseId: course.id, studentId: s.id },
    });
  }

  const existing = await prisma.classSession.findFirst({ where: { courseId: course.id } });
  if (!existing) {
    const session = await prisma.classSession.create({
      data: {
        roomCode: 'DBMS7K', title: 'Normalisation', courseId: course.id,
        teacherId: teacher.id, status: 'LIVE',
        startedAt: new Date(), lastTeacherPingAt: new Date(),
      },
    });

    await prisma.question.create({
      data: {
        sessionId: session.id, order: 1,
        prompt: 'Which normal form removes transitive dependency?',
        type: QuestionType.MCQ,
        options: ['1NF', '2NF', '3NF', 'BCNF'],
        marks: 2, durationSeconds: 30,
        key: { create: { correctIndex: 2, explanation: '3NF eliminates transitive dependencies on the primary key.' } },
      },
    });
  }

  // ── LMS demo content: grading scheme, an assignment, a schedule ──
  const hasCategories = await prisma.gradeCategory.findFirst({ where: { courseId: course.id } });
  if (!hasCategories) {
    await prisma.gradeCategory.createMany({
      data: [
        { courseId: course.id, name: 'Assignments', kind: 'ASSIGNMENTS', weightPct: 40, order: 0 },
        { courseId: course.id, name: 'Live quizzes', kind: 'LIVE_QUIZZES', weightPct: 40, order: 1 },
        { courseId: course.id, name: 'Attendance', kind: 'ATTENDANCE', weightPct: 20, order: 2 },
      ],
    });
  }

  const hasAssignment = await prisma.assignment.findFirst({ where: { courseId: course.id } });
  if (!hasAssignment) {
    const cat = await prisma.gradeCategory.findFirst({
      where: { courseId: course.id, kind: 'ASSIGNMENTS' },
    });
    await prisma.assignment.create({
      data: {
        courseId: course.id,
        categoryId: cat?.id ?? null,
        title: 'ER modelling exercise',
        instructions: 'Model the library domain. Submit a PDF or write your answer inline.',
        maxMarks: 50,
        dueAt: new Date(Date.now() + 7 * 86_400_000),
        status: 'PUBLISHED',
      },
    });
  }

  const hasSlot = await prisma.scheduleSlot.findFirst({ where: { courseId: course.id } });
  if (!hasSlot) {
    await prisma.scheduleSlot.createMany({
      data: [
        { courseId: course.id, dayOfWeek: 1, startTime: '09:00', endTime: '10:30', room: 'LT-4' },
        { courseId: course.id, dayOfWeek: 3, startTime: '11:00', endTime: '12:30', room: 'LT-4' },
      ],
    });
  }

  const hasAnnouncement = await prisma.announcement.findFirst({ where: { courseId: course.id } });
  if (!hasAnnouncement) {
    await prisma.announcement.create({
      data: {
        courseId: course.id, authorId: teacher.id,
        title: 'Welcome to Database Systems',
        body: 'Lecture notes and the weekly schedule are up. Live sessions run with a room code — join from the Live session page.',
      },
    });
  }

  console.log('Seeded:');
  console.log(`  admin    admin@sessionhub.edu   / Password123!`);
  console.log(`  teacher  teacher@sessionhub.edu / Password123!`);
  console.log(`  students ada|alan|grace@sessionhub.edu / Password123!`);
  console.log(`  course   CS-204, live session room code DBMS7K`);
  void admin;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
