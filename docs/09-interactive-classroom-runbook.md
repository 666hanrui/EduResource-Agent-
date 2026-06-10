# Interactive Classroom Runbook

EduResource-Agent keeps OpenMAIC as an independent subsystem under
`apps/interactive-classroom`. The student main generation flow now uses this
three-service topology:

For module ownership and "do not cross this boundary" rules, read
`docs/10-openmaic-module-boundaries.md` before editing integration code.

| Service | Path | Port | Role |
| --- | --- | --- | --- |
| FastAPI backend | `backend/` | `8000` | Student profile, resource package, attempts, evaluation, learning path |
| Student frontend | `frontend/` | `5173` | Student/coach UI and interactive classroom launcher |
| OpenMAIC classroom | `apps/interactive-classroom/` | `3100` | Classroom generation, playback, quiz UI, PPT/HTML export |

## Environment

Backend:

```bash
export OPENMAIC_BASE_URL=http://localhost:3100
```

OpenMAIC:

```bash
export EDURESOURCE_API_BASE_URL=http://localhost:8000/api
```

## Local Startup

Terminal 1:

```bash
cd backend
OPENMAIC_BASE_URL=http://localhost:3100 uvicorn main:app --reload --port 8000
```

Terminal 2:

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

Terminal 3:

```bash
cd apps/interactive-classroom
EDURESOURCE_API_BASE_URL=http://localhost:8000/api corepack pnpm exec next dev -p 3100
```

Then verify:

```bash
curl http://localhost:3100/api/health
```

## Student Flow

1. Student selects a knowledge point in the frontend.
2. Frontend posts to `POST /api/students/{student_id}/interactive-classrooms`.
3. FastAPI creates a `ResourcePackage`, assembles `eduResourceContext`, and calls OpenMAIC.
4. Frontend polls `GET /api/students/{student_id}/interactive-classrooms/{job_id}`.
5. When the OpenMAIC job succeeds, the frontend opens `classroom_url` in a new page.
6. Quiz attempts write back through OpenMAIC to FastAPI.
7. FastAPI persists `ExerciseAttempt` and `EvaluationRecord`, then updates `StudentProfile` and `LearningPath`.

The legacy `POST /api/generate` 7-Agent card flow remains available from the
frontend as lightweight resource generation.

## Boundary Reminder

OpenMAIC owns interactive classroom generation/playback. EduResource owns
profiles, packages, attempts, evaluations, learning paths, and teacher review.
The Bilibili/local-animation supplemental resources are EduResource lightweight
resources, not OpenMAIC scenes.
