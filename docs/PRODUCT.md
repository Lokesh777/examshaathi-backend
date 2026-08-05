# ExamSaathi — Product overview

ExamSaathi is an AI study partner for Rajasthan competitive exams (starting with **CET 12th Level**). Students practice from a shared question bank, keep a daily streak, sit pattern-true mocks, and clear doubts with a language-aware AI Tutor.

---

## Core loops

### 1. Daily streak challenge

- **What:** 20 mixed questions drawn from the whole exam syllabus.
- **Where:** Top of the Topics screen for an exam.
- **Streak:** Counted in **IST**; one successful daily attempt keeps the streak.
- **Quiz type:** `daily-challenge`.
- **API:** `GET /api/quiz/exams/:examId/daily`, `GET /api/quiz/exams/:examId/streak`.

### 2. Shared topic question bank

- Questions are **shared** (not private per user). Any logged-in student can generate into the bank.
- Modes: **Normal** | **New Pattern** | **Mixed**.
- Count: **10–20** questions per generate.
- Deduped against existing bank content; quality gate on AI output.
- Prefer previous-paper / admin refs when grounding generation (no third-party site scraping).
- **API:** `POST /api/quiz/exams/:examId/topics/:topicId/generate`.
- Bank list: `GET .../topics/:topicId/questions` (admin = all, user = own generated).

### 3. Topic practice quizzes & readiness

- Tap a topic → hub: create frozen per-user practice quizzes, see **Attempted / Not attempted**, attempt counts, Start / Re-attempt.
- Timer scales with question count (short quizzes do **not** get a full 150-minute paper timer).
- **Readiness:** solved topic quizzes toward a target of **5** (ring + progress when ≥1 solved).
- Delete: quiz owner or admin; question delete: creator or admin.

### 4. AI Tutor

- Nav **AI Tutor** (`ChatTabPage`) — topic switcher, suggestion chips, Hindi/English language badge.
- Backend (`chat.service.js`):
  - Topic language via `resolveTopicLanguage` (English sections stay English).
  - Student language detection (Hindi / English / Hinglish).
  - Grounding from recent high-quality bank Q&As + short chat history.
  - Concise exam-style answers; **no source URLs** returned or shown (broken weightage links removed from UI and new AI `referenceLinks`).
- Also available on per-topic chat route.

### 5. Mocks & old papers

- **Mocks:** Full-length papers matched to exam pattern; shortfall UI can generate missing topic deficits into the bank.
- **Old papers:** Official catalog sync / extract / publish (see [OLD_PAPER_SERVICE.md](./OLD_PAPER_SERVICE.md) and [PAPER_EXTRACTION.md](./PAPER_EXTRACTION.md)).

### 6. Leaderboard & results

- Per-quiz leaderboard (Top ranks + own rank).
- Result explanations without broken “Sources” links.

---

## Landing messaging (keep in sync)

Public landing highlights:

1. Daily streak (20 mixed Qs)
2. Shared topic banks (normal / new pattern / mixed)
3. Topic quizzes + readiness
4. AI Tutor (HI + EN)
5. Mocks & official old papers
6. Leaderboard & progress

Update `frontend/src/components/landing/*` when product behaviour changes materially.

---

## Stack (high level)

| Layer | Stack |
|-------|--------|
| Frontend | Next.js App Router, React, TypeScript, Tailwind, TanStack Query |
| Backend | Node / Express, MongoDB, Groq (generation + tutor), embeddings for chat cache |
| Auth | Bearer access token + HttpOnly refresh cookie (cross-origin) |

---

## Key frontend routes

| Path | Purpose |
|------|---------|
| `/` | Marketing landing |
| `/exams` | Exam picker / dashboard entry |
| `/exams/:examId/topics` | Daily streak + topics + readiness |
| `/exams/:examId/topic-quiz/:topicId` | Topic hub / quizzes |
| `/exams/:examId/chat` | AI Tutor |
| `/exams/:examId/mock` | Mock dashboard |
| `/exams/:examId/old-papers` | Official papers |
| `/exams/:examId/quiz/:quizId` | Quiz player |
| `/result` | Attempt results |

---

## Language rules (product)

- **English syllabus topics** (e.g. General English / grammar): questions and tutor answers in English.
- **Other topics:** Hindi (Devanagari) preferred; tutor still matches the student’s language when they ask in English/Hinglish.
- Numerals in Hindi content: Arabic digits (`1576`, not `१५७६`).

---

## Out of scope / intentional limits

- No browser scraping of third-party exam sites for generation or “sources”.
- Answer “Sources” UI is hidden; do not reintroduce weightage URLs as citations.
- Generation is shared-bank, not a private per-user vault.
