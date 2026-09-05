/* Sets up a real live session for screenshotting: teacher creates a session,
   adds questions, opens one; a poll is created; two students join and one
   answers. Prints ids for cleanup. */
const API = 'http://localhost:4000';
const PASS = 'Password123!';

async function login(email) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return r.json();
}
async function call(token, method, path, body) {
  const r = await fetch(`${API}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function main() {
  const t = await login('teacher@sessionhub.edu');
  const courses = await call(t.accessToken, 'GET', '/courses');
  const course = courses[0];

  const session = await call(t.accessToken, 'POST', '/sessions', {
    courseId: course.id, title: 'Transactions and isolation levels',
  });
  console.log('SESSION', session.id, session.roomCode);

  const qs = await call(t.accessToken, 'POST', `/sessions/${session.id}/questions`, {
    questions: [
      {
        prompt: 'Which isolation level prevents dirty reads but still allows non-repeatable reads?',
        type: 'MCQ',
        options: ['Read uncommitted', 'Read committed', 'Repeatable read', 'Serializable'],
        correctIndex: 1,
        explanation: 'Read committed only ever shows committed data, but a row re-read inside one transaction can still change.',
        marks: 2,
        durationSeconds: 120,
      },
      {
        prompt: 'Name one anomaly that serializable isolation eliminates.',
        type: 'SHORT',
        options: [],
        explanation: 'Any of: dirty read, non-repeatable read, phantom read, write skew.',
        marks: 2,
      },
    ],
  });
  const list = Array.isArray(qs) ? qs : qs.questions ?? [];
  console.log('QUESTIONS', list.map((q) => q.id).join(','));

  const poll = await call(t.accessToken, 'POST', `/sessions/${session.id}/polls`, {
    prompt: 'How is the pace so far?',
    options: ['Too slow', 'About right', 'Too fast'],
  });
  console.log('POLL', poll.id);

  // Students join.
  const ada = await login('ada@sessionhub.edu');
  const alan = await login('alan@sessionhub.edu');
  await call(ada.accessToken, 'POST', '/sessions/join', { roomCode: session.roomCode });
  await call(alan.accessToken, 'POST', '/sessions/join', { roomCode: session.roomCode });

  // Open the MCQ; one student answers; both vote in the poll.
  const first = list[0];
  if (first) {
    await call(t.accessToken, 'POST', `/questions/${first.id}/open`);
    await call(ada.accessToken, 'POST', `/questions/${first.id}/answer`, { answerIndex: 1 });
    console.log('OPENQ', first.id);
  }
  await call(ada.accessToken, 'POST', `/polls/${poll.id}/vote`, { optionIndex: 1 });
  await call(alan.accessToken, 'POST', `/polls/${poll.id}/vote`, { optionIndex: 2 });

  console.log('READY');
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
