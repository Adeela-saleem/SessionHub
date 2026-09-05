# SessionHub

Real-time interactive classroom platform. A teacher starts a session and gets a
six-character room code; students join with that code and answer questions on
their phones while the teacher watches the distribution build live.

Roles: **Student**, **Teacher**, **Admin**.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 · TypeScript · Vite · React Router · TanStack Query |
| Backend | NestJS 10 · TypeScript |
| Database | PostgreSQL 16 · Prisma |
| Realtime | Socket.IO |
| Auth | JWT access + rotating refresh tokens · argon2id |
| Infra | Docker Compose · nginx |

---

## Quick start

```bash
cp .env.example .env

# Generate the two JWT secrets (the API refuses to boot without them)
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)"  >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)" >> .env

docker compose up --build -d
docker compose exec api npx prisma db seed
```

| Service | URL |
|---|---|
| Web | http://localhost:8080 |
| API | http://localhost:4000/api |
| API docs (non-production) | http://localhost:4000/api/docs |
| Health | http://localhost:4000/api/health |

### Seeded accounts

All use the password `Password123!` — change them before deploying anywhere.

| Role | Email |
|---|---|
| Admin | `admin@sessionhub.edu` |
| Teacher | `teacher@sessionhub.edu` |
| Students | `ada@` · `alan@` · `grace@sessionhub.edu` |

A live session is seeded on course **CS-204** with room code **`DBMS7K`**.

### Try the core loop

1. Sign in as the teacher → **Live control** → the session is already live.
2. Open the seeded question.
3. In another browser, sign in as `ada@sessionhub.edu` → **Join session** → enter `DBMS7K`.
4. The question appears with a synchronised countdown. Answer it.
5. Back on the teacher screen, close the question — both sides see the distribution.

---

## Repository layout

```
.
├── docker-compose.yml
├── apps/
│   ├── api/                    NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma   14 models
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── auth/           JWT, refresh rotation, argon2
│   │       ├── common/         guards, decorators, filters
│   │       ├── sessions/       room codes, attendance, auto-close
│   │       ├── quiz/           questions, answers, grading
│   │       ├── polls/  qa/     live poll and Q&A
│   │       ├── ai/             Groq quiz drafting
│   │       ├── realtime/       Socket.IO gateway
│   │       └── users/ courses/
│   └── web/                    React + Vite
│       └── src/
│           ├── components/ui/  Button, Card, Field, RoomCode…
│           ├── features/session/
│           ├── lib/            api client, auth, socket
│           ├── pages/
│           └── styles/         tokens, primitives, app
└── legacy/                     the previous Firebase build, kept for reference
```

---

## Security model

The previous build let the browser hold the answer key, decide when a question
closed, and decide how many times a student could answer. All three now sit
behind the API.

**The answer key is a separate table.** `QuestionKey` holds `correctIndex` and
`explanation`. No student-facing query joins it, and the student-facing type
(`PublicQuestion`) has no such field. Results are served only after the server
has closed the question.

**Question timing is server-authoritative.** `POST /questions/:id/open` stamps
`closesAt`; the submit handler compares against it server-side. The browser's
countdown is presentation only — a paused tab, a closed laptop, or a doctored
system clock changes nothing about what the API accepts.

**Double submission is a database constraint.** `Answer` carries
`@@unique([questionId, studentId])`, so a second submission is a 23505 that
surfaces as `409 CONFLICT`. Nothing depends on client state.

**Every route is authenticated by default.** `JwtAuthGuard` is global; a route
opts out with `@Public()`. Roles are checked by `RolesGuard` on the server.
`ADMIN` is absent from the signup DTO's enum, so it is not self-registerable at
any layer, and teacher accounts are created `PENDING` until an admin approves.

**Sockets authenticate once, at connect,** and the identity is pinned to
`socket.data`. Later events never carry a client-supplied user id, and joining
a session room re-checks enrolment.

**AI output is validated and reviewed.** Generated questions are returned as
drafts and are never persisted by the generate endpoint. A teacher must post
them explicitly, so nothing an LLM invents reaches students unreviewed.

---

## Development

```bash
# API
cd apps/api && npm install && npx prisma generate
npm run start:dev            # needs DATABASE_URL

# Web
cd apps/web && npm install && npm run dev
```

### Tests

```bash
cd apps/api && npm test
```

`quiz.service.spec.ts` pins the trust boundary: answering a closed question,
answering after `closesAt`, answering while not enrolled, and the shape of the
submit response (which must never contain `correctIndex`).

### Migrations

```bash
docker compose exec api npx prisma migrate dev --name <change>   # author
docker compose exec api npx prisma migrate deploy                # apply
```

The production image runs `migrate deploy` on start.

---

## Environment

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | yes |
| `JWT_ACCESS_SECRET` | Access-token signing key, min 32 chars | yes |
| `JWT_REFRESH_SECRET` | Refresh-token signing key, min 32 chars | yes |
| `JWT_ACCESS_TTL` | Access-token lifetime (default `15m`) | no |
| `JWT_REFRESH_TTL` | Refresh-token lifetime (default `7d`) | no |
| `CORS_ORIGIN` | Comma-separated allowed origins | no |
| `GROQ_API_KEY` | Enables AI quiz drafting | no |
| `GROQ_MODEL` | Default `openai/gpt-oss-120b` (Groq retired the Llama 3.1 models) | no |
| `VITE_API_URL` | API origin baked into the web build | no |

Boot fails fast if a required variable is missing or a secret is too short.

---

## Not yet built

Honest list, so nobody discovers these the hard way:

- **Polls and Q&A have APIs but no frontend yet** — the endpoints, socket
  events and tables are complete; the React screens are not.
- **AI paper formatting** was in the Firebase build and has not been ported.
  The prompt work is preserved in `legacy/functions/index.js`.
- **Analytics** screens are not rebuilt; the data to drive them exists.
- **No E2E suite.** Unit tests cover the trust boundary only.
- **Attendance `secondsPresent`** is stored but not yet accumulated across
  reconnects.
