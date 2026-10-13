# DocChase — Master Build Prompt (for the coding agent)

> Working title: **DocChase** — "Stop chasing clients for documents."
> A MERN SaaS for small accounting / tax-practice firms to collect, validate and export client documents.

You are the lead engineer for this project. Build it end to end, in phases, to production quality for a solo-student scale. Read this whole prompt first. If `docs/END_TERM_PROJECT_GUIDELINES.md` exists in the repo, read it fully as well; every constraint below is derived from it and it wins on any conflict.

---

## 0. Rules of engagement

1. **Read before writing.** Read this prompt and the guidelines file completely before the first line of code.
2. **Bootstrap files first:** create `AGENTS.md` (condensed version of these rules so future sessions keep context), `PLAN.md` (phase checklist), `PROGRESS.md` (running log) and `docs/DECISIONS.md` (short ADR-style log of every non-obvious decision and why).
3. **Work phase by phase** (Section 15). A phase is finished only when: lint passes, tests pass, the app runs, `PROGRESS.md` is updated, and work is committed. Do not start the next phase while a gate fails.
4. **Do not ask questions** unless you are blocked on something only the human can provide (accounts, API keys). Otherwise make the most reasonable decision and log it in `docs/DECISIONS.md`. While keys are missing, keep working with the local adapters (local disk storage, mock extractor, console mailer).
5. **Verify third-party APIs against official docs** (use a docs MCP such as Context7, or web search, if available) instead of relying on memory, especially for Agenda, the Google Gen AI SDK, Mongoose, Vite, Tailwind and shadcn/ui. Pin dependency versions.
6. **Simplicity over cleverness.** No microservices, Redis, GraphQL, Kubernetes, or anything the app does not need. Choose technology because the product needs it, not because it sounds impressive.
7. **Secrets:** never commit, print or hard-code secrets. Never read the human's real `.env`. Ship `.env.example` only.
8. **Commits:** small, one logical change each, Conventional Commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). Never squash the whole project into one commit, never rewrite published history, never fake or backdate commits. Target 60+ meaningful commits by the end.
9. **Tests alongside features**, not at the end.
10. **At the end of every phase** print: what was done, deviations from this prompt, what is next, and any **human actions required** (keys, accounts, deployments).

---

## 1. Hard constraints (from the university guidelines)

- **Stack must be MERN:** MongoDB, Express, React, Node.js.
- **Deadline: 27 October 2026, 11:59 PM IST.** Today is 13 October 2026. Internal target: *submission-ready by 25 October*, with 26–27 October as buffer only. **Feature freeze at the end of 22 October.**
- Must be a **working application with real application logic**. Explicitly NOT acceptable: static site, UI-only/mock-data frontend, tutorial clone, basic CRUD app, basic API wrapper, or an app with many advertised features where major workflows do not work.
- Implement **3–5 important workflows properly** (this project has 4). **Depth over feature count.**
- Required deliverables: source on GitHub with real commit history, deployed app evaluators can open, README + docs, 3–5 minute demo video, official submission form.
- Evaluation weights: Problem & Product Understanding 10%, Core Product Implementation 25%, Engineering & Application Logic 20%, Architecture & Technical Decisions 15%, UX & Reliability 10%, Code Quality & Structure 10%, Deployment & Documentation 10%.
- AI-assisted code is allowed but does not excuse broken functionality, poor architecture, exposed credentials, missing error handling, incomplete workflows, or a non-functional deployment.

---

## 2. Product definition

**Problem.** Small CA / tax-consultant / bookkeeping firms (especially in India) must collect invoices, bank statements and receipts from dozens or hundreds of clients every month (GST) or year (ITR). Clients send documents scattered across WhatsApp and email, late, incomplete, unreadable or duplicated. Staff then chase clients manually, rename files, and retype data into Tally or Excel.

**Target users.**
- *Primary:* accountant / firm staff who run client compliance work.
- *Secondary:* the client (shop owner, freelancer) on a phone with low tech comfort. Must never need an account.
- *Tertiary:* the firm owner who needs oversight of who is late.

**Solution.** DocChase gives each client-period a checklist of required documents and a no-signup magic upload link. Uploaded documents are extracted and validated in the background (including Indian GST rules). Clean documents are bulk-approved in one click, doubtful ones go to a fast review queue, missing items trigger automated reminders, and approved data exports as a clean register plus renamed files.

**Why software, not a spreadsheet + WhatsApp group:** per-client, per-period completeness tracking; validation at upload time while the client is still reachable; structured data instead of retyping; automated chasing; audit trail; private, access-controlled storage.

**Non-goals (do NOT build):** payments/billing, official WhatsApp Business API automation, native mobile app, multi-language UI, OCR model training, Tally XML import as a core feature (stretch only), microservices, real-time collaboration beyond a simple activity feed.

---

## 3. The four core workflows (and acceptance criteria)

### W1 — Firm setup, clients and checklists
- Register a firm (creates the owner account), login/logout, owner invites staff. Roles: `owner`, `staff` (permission matrix in Section 7).
- Clients: create/edit/archive; fields: name, contact person, phone, email, optional GSTIN and PAN (validated), assigned staff member, `remindersPaused`.
- Checklist templates: presets ("GST monthly — regular taxpayer", "ITR — salaried", "ITR — business/professional") plus user-defined. A checklist is created for a client + period (e.g. "GSTR-3B Sep 2026") with a due date. Items: `docType` (`invoice` | `bank_statement` | `receipt` | `other`), label, direction (`purchase` | `sale` where relevant), `required`, `multiple` (accepts many files, e.g. purchase invoices).
- Dashboard: all active checklists with status and progress ("3 of 5 received"), filters (overdue, waiting on client, needs my review), search by client.
- **Accept when:** an accountant can go from empty firm to a client with a checklist and see correct derived status; staff cannot do owner-only actions; no user can ever see another firm's data.

### W2 — Magic-link document collection
- Generate a link per checklist; copy it, send via a prefilled `wa.me` WhatsApp link (message includes firm name, client name, due date, link), or send by email.
- Client page (no login, **mobile-first**): shows firm name, checklist items and progress; per-item upload via camera or file picker; multiple files where allowed; client-side image downscale before upload; per-file progress, retry on failure; per-file status (received → being checked → approved / needs fixing with reason); "I don't have this" button with a note, which the accountant sees.
- Server: validate size (≤10 MB) and real file type by magic bytes (PDF, JPEG, PNG, WebP only), compute SHA-256, reject exact duplicates for the same client with a friendly message, store via the storage adapter, create the `Document`, enqueue extraction.
- Magic link rules: 32-byte random token, store only its SHA-256 hash, scoped to exactly one checklist, expires (default: due date + 7 days), revocable, rate-limited, records `lastUsedAt`. A link can only upload to and view its own checklist.
- **Accept when:** a client can complete an upload from a phone browser with zero signup; expired/revoked/foreign tokens are rejected with clear messages; accountant sees activity ("Ravi uploaded 2 files") without refreshing manually (polling or SSE).

### W3 — Extraction, validation and human review (the hero workflow)
- On upload, a background job extracts structured fields from the document, runs the validation rules in Section 4, computes a confidence score and routes the document.
- Review queue: side-by-side view (document preview left, editable extracted fields right) with live re-validation, **Approve**, **Edit & approve**, **Reject with reason** (reason is shown to the client on their link so they can re-upload), keyboard shortcuts (A approve, R reject, N next), and **bulk approve for all clean documents**.
- Every review action writes an immutable audit-log entry (actor, before/after diff, timestamp).
- Manual entry fallback: if extraction fails or AI is unavailable, the reviewer can type the fields manually. AI is an accelerator, never a hard dependency.
- **Accept when:** an invoice with a wrong total or invalid GSTIN is caught and flagged with the exact reason; a clean invoice lands in the "clean" bucket; failed extraction retries automatically and then surfaces as `failed` with a manual option; rejecting a document lets the client re-upload and links the new version to the old.

### W4 — Reminders and export
- Reminder plan per checklist (defaults in firm settings): e.g. 3 days before due, 1 day before, on due date, then every 2 days while overdue. Stops automatically when the checklist is complete; respects `remindersPaused`; no reminders during quiet hours (default 21:00–08:00 IST).
- Channels: email (adapter) and WhatsApp click-to-send link surfaced to the accountant as a one-tap "Send reminder on WhatsApp" action. Every reminder is logged in `reminder_logs`.
- Scheduler is **idempotent**: a unique `(checklistId, slotKey)` index guarantees the same reminder is never sent twice, even if the job runs twice or the server restarts.
- Export: CSV register of approved documents per checklist/client/period (invoice number, date, supplier, supplier GSTIN, taxable value, CGST, SGST, IGST, cess, total, document link/filename) and a ZIP of approved originals renamed `ClientName_2026-09_Purchase-Invoice_<InvNo>.pdf`. *Stretch only, after everything else is done:* Tally-importable XML.
- **Accept when:** a due reminder is sent exactly once; completing the checklist stops further reminders; export contains only approved data and opens cleanly in Excel (UTF-8 BOM, correct number formats).

---

## 4. Domain logic (this is what makes it more than an API wrapper)

### 4.1 Document types and schemas (Zod, in a registry)
Adding a document type must be one new file registered in a registry (schema + prompt + validation rules).
- **invoice:** invoiceNumber, invoiceDate, supplier{name, gstin, stateCode}, buyer{name, gstin}, placeOfSupply, lineItems[{description, hsn, qty, rate, taxableValue, taxRate}], taxableValue, cgst, sgst, igst, cess, roundOff, total.
- **bank_statement:** bankName, accountNumberLast4, period{from,to}, openingBalance, closingBalance, totalCredits, totalDebits (transaction list optional, best-effort).
- **receipt:** vendor, date, amount, paymentMode, optional category.
Build `invoice` fully first, then `bank_statement`, then `receipt`.

### 4.2 Validation rules (pure functions, each returns `{ruleId, severity: error|warn|info, field, message}`)
**Invoice**
- `INV-001` supplier GSTIN: 15-char format, valid state code, embedded PAN pattern, and the check-character (mod-36) checksum. Unit-test with known valid and invalid GSTINs. Error if invalid.
- `INV-002` `taxableValue + cgst + sgst + igst + cess + roundOff ≈ total` (tolerance ₹1).
- `INV-003` sum of line items ≈ `taxableValue`.
- `INV-004` tax-type consistency: supplier state (GSTIN prefix) vs place of supply → intra-state must have CGST = SGST and no IGST; inter-state must have IGST only.
- `INV-005` effective tax rate within a configurable list of known GST rates (include historical and current rates) — warn only, never error.
- `INV-006` date valid, not in the future, inside the checklist period (warn if outside).
- `INV-007` duplicate detection: same `(clientId, supplier GSTIN, invoice number, financial year)` → flag as possible duplicate. Exact same file hash is blocked at upload (W2).
- `INV-008` required fields present.
- `INV-009` for purchase invoices, buyer GSTIN should match the client's GSTIN (warn on mismatch).

**Bank statement**
- `BANK-001` balance reconciliation: `opening + credits − debits ≈ closing` (tolerance ₹0.01).
- `BANK-002` statement period covers the checklist period (warn).
- `BANK-003` required fields present.

**Receipt:** `REC-001` required fields, amount > 0, sane date.

### 4.3 Confidence and routing
- The model returns per-field confidence (0–1). Document confidence = documented formula combining the minimum/mean field confidence with rule outcomes. Thresholds are configurable (firm settings, env defaults).
- Routing: any `error` → `needs_review` (red). Any `warn` or confidence below threshold → `needs_review` (amber). Otherwise → `extracted_clean` (green), eligible for bulk approve. Nothing is ever auto-approved without a human action by default.
- The reviewer sees which rule fired and which field it concerns.

### 4.4 State machines (explicit transition tables, illegal transitions throw `409`, fully unit-tested)
- **Document:** `uploaded → queued → processing → extracted_clean | needs_review | failed → approved | rejected`. `failed → queued` (manual retry). `rejected` is terminal for that file; a replacement upload creates a new version linked via `supersedes`.
- **Checklist item:** `pending → received → under_review → approved`, plus `rejected` (needs re-upload) and `waived`/`not_available` (client or staff note).
- **Checklist (derived):** `open | complete | overdue`, computed from items and due date, never stored inconsistently.

### 4.5 Extraction pipeline and jobs (Agenda, MongoDB-backed, no Redis)
- `Extractor` adapter interface: `extract({buffer, mimeType, docType, schema}) → {fields, fieldConfidence, usage}`.
  - `GeminiExtractor`: Google Gen AI SDK, structured JSON output, model name from env (`GEMINI_MODEL`), response parsed with Zod; on invalid JSON make **one** repair attempt, then fail.
  - `MockExtractor`: deterministic, reads fixtures/sidecar JSON; used for tests, local dev without a key, and as a reliability fallback for demos.
- Preprocess images (downscale to a sane max dimension). Cache by file SHA-256 so identical files never cost a second API call. Per-firm daily extraction cap to protect the free quota.
- Treat document content as **untrusted input**: the system prompt tells the model to ignore any instructions inside documents; model output is only ever parsed as data and schema-validated.
- Jobs:
  - `extract-document`: concurrency 2, 3 attempts with exponential backoff (30s / 2m / 10m), idempotent per `(documentId, sha256)`, final failure → `failed` with stored reason.
  - `send-reminders`: runs every 15 minutes, idempotent via `slotKey`.
  - `recover-stuck-jobs`: documents stuck in `processing` for more than 10 minutes go back to `queued`.
- The worker runs in-process by default (`RUN_WORKER=true`) and is also runnable separately (`npm run worker`) so it can be split out later.

---

## 5. Architecture and stack

Monorepo: `client/` (React) and `server/` (Express). In production **Express serves the built React app** (one deployable, same origin, no CORS problems).

**Frontend:** React + Vite (JavaScript), React Router, TanStack Query, Tailwind CSS + shadcn/ui, React Hook Form + Zod, `react-pdf` for previews, `browser-image-compression` for client-side downscaling.

**Backend:** Node 20+ (ESM JavaScript), Express, Mongoose, Zod (request validation + env validation), Agenda, `jsonwebtoken`, `bcryptjs` (or argon2), `helmet`, `express-rate-limit`, `multer` (memory storage, size-capped), `file-type` (magic bytes), `pino` (structured logs with request IDs), `nodemailer`, `csv-stringify`, `archiver`.

**Adapters (each with a real implementation and a local/test one):**
- Storage: `LocalDiskStorage` (dev/test) and a cloud provider (Cloudinary authenticated delivery, or equivalent) for production. Files are **private**; every download goes through an authorization check, either streamed by the backend or via a short-lived signed URL.
- Extractor: `GeminiExtractor` / `MockExtractor`.
- Mailer: SMTP via `nodemailer` (e.g. Brevo free SMTP) / console + Ethereal in dev.

**Suggested layout**
```
docchase/
  AGENTS.md  PLAN.md  PROGRESS.md  README.md
  docs/  (ARCHITECTURE.md DECISIONS.md API.md DEMO_SCRIPT.md SUBMISSION.md CHECKLIST.md SETUP_ACCOUNTS.md END_TERM_PROJECT_GUIDELINES.md)
  server/
    src/
      app.js  server.js  worker.js
      config/env.js            # Zod-validated env, fails fast
      db/models/               # Mongoose models
      modules/ auth clients checklists magicLinks uploads documents review reminders exports audit
      lib/ storage/ extractor/ mailer/ validation/ logger.js errors.js
      jobs/ agenda.js definitions/
      middleware/              # auth, rbac, tenancy, rateLimit, error, requestId
    tests/  scripts/ (seed.js, generate-sample-docs.js)
  client/src/ pages/ features/ components/ lib/api.js
  .github/workflows/ci.yml
  docker-compose.yml (optional: local MongoDB only)
```
Adjust if you have a good reason, and log it.

**Auth:** JWT in an `httpOnly`, `Secure` (prod), `SameSite=Lax` cookie with a `tokenVersion` for revocation. Same-origin deployment plus a required custom header and Origin check on state-changing requests covers CSRF. Magic-link access is a separate, token-scoped path and never yields a user session.

---

## 6. Data model (MongoDB collections)

- `firms`: name, settings{timezone `Asia/Kolkata`, reminderDefaults, quietHours, confidenceThreshold}, createdAt.
- `users`: firmId, name, email (unique), passwordHash, role, tokenVersion, status.
- `clients`: firmId, name, contactPerson, phone (E.164), email, gstin?, pan?, assignedUserId?, remindersPaused, archivedAt.
- `checklists`: firmId, clientId, title, periodLabel, periodStart, periodEnd, dueDate, reminderPlan, `items[]` embedded (bounded: itemId, docType, label, direction, required, multiple, state, naNote).
- `magic_links`: firmId, checklistId, tokenHash (unique), expiresAt, revokedAt, lastUsedAt, useCount.
- `documents`: firmId, clientId, checklistId, itemId, storageKey, originalName, mimeType, size, sha256, version, supersedes, uploadedVia, status, `extraction{status, provider, model, fields, fieldConfidence, validation[], confidence, attempts, lastError, processedAt}`, `review{reviewedBy, reviewedAt, decision, reason, editedFields}`.
- `audit_logs` (append-only): firmId, actor{type: user|client_link|system, id}, action, entity, before, after, at.
- `reminder_logs`: firmId, checklistId, slotKey, channel, status, error, sentAt. **Unique `(checklistId, slotKey)`.**
- `notifications` (activity feed): firmId, userId?, type, payload, readAt.
- Agenda's own jobs collection.

Indexes you must create: `users.email` unique, `magic_links.tokenHash` unique, `(firmId, clientId, sha256)` on documents, partial index for invoice duplicate lookup, `(checklistId, slotKey)` unique, `(firmId, status, dueDate)` on checklists.

**Tenancy rule:** every query is scoped by the `firmId` taken from the session, never from the request body. Enforce it through a shared repository helper or Mongoose plugin, and prove it with tests (cross-firm access returns `404`).

---

## 7. Security and privacy

- All secrets in environment variables; `.env` in `.gitignore`; `.env.example` documents every variable with no real values; `gitleaks` runs in pre-commit and CI.
- Passwords hashed (bcrypt/argon2), never logged. Login rate-limited with generic error messages.
- Validate all input with Zod at the route boundary; sanitize against NoSQL operator injection; `helmet` headers; strict body size limits.
- Permission matrix: **owner** = everything incl. staff invites, firm settings, deleting clients; **staff** = clients, checklists, review, reminders, exports for allowed clients; **client link** = upload to and view its one checklist only.
- Uploads: magic-byte type check, size cap, random storage keys (never user-supplied filenames as paths), no direct public URLs.
- Privacy: mask bank account numbers (last 4 only) in UI and exports; "Delete client" hard-deletes the client's documents and files; links are revocable.
- Never log document contents or extracted PII.

---

## 8. Error handling matrix (implement and test each)

| Situation | Required behaviour |
|---|---|
| Invalid input | 400 with field-level messages; form shows them inline |
| Unauthenticated / wrong role | 401 / 403, UI redirects or explains |
| Cross-firm or missing resource | 404 (do not leak existence) |
| Expired / revoked / unknown magic link | Friendly page: "This link has expired — ask {firm} for a new one" |
| Unsupported type / too large / corrupt file | Rejected before storage with a clear client-facing message |
| Duplicate file | Friendly "already received" message, no second record |
| Upload network failure | Per-file retry button; no silent loss |
| Gemini timeout / 429 / bad JSON | Retry with backoff, one JSON repair, then `failed` + manual entry path |
| Mongo down / DB error | 503 with request ID, logged, no stack trace to client |
| Job crash / server restart mid-job | Stuck-job recovery re-queues; idempotency prevents double effects |
| Illegal state transition | 409 with explanation |
| Concurrent review of same document | Optimistic concurrency (version field) → second reviewer gets a conflict message |
| Reminder run twice | Unique index prevents duplicate send |
| Email send failure | Logged in `reminder_logs` with error; shown to accountant; WhatsApp link still available |

A global Express error handler returns a consistent JSON shape `{error:{code,message,requestId,details?}}`. The React app has an error boundary and shared loading / empty / error / success components.

---

## 9. UX requirements

- Every list and page handles **loading (skeletons), empty (with a call to action), error (with retry) and success** states.
- The client upload page is designed at 360 px width first; large tap targets; plain language; no jargon; shows "3 of 5 received" progress.
- Dashboard: status chips (clean / needs review / failed / overdue), filters, search, clear next action per row.
- Review screen: keyboard shortcuts, inline validation messages tied to fields, zoom on document.
- Basic accessibility: labels, focus states, colour not the only signal, sensible contrast.
- Destructive actions ask for confirmation. Toasts for success/failure of every mutation.

---

## 10. Testing and CI

- **Unit:** GSTIN checksum, every validation rule, state machines, token generation/hashing, CSV builder, reminder slot calculation, confidence/routing logic.
- **Integration** (Vitest or Jest + Supertest + `mongodb-memory-server`): auth, **tenancy isolation across two firms**, role permissions, magic-link expiry/revocation/scope, upload validation and dedupe, extraction job with `MockExtractor` including failure + retry + stuck recovery, reminder scheduler idempotency, export contents.
- **E2E:** one Playwright happy path: create client → checklist → open magic link at mobile viewport → upload → review → approve → export.
- **CI** (GitHub Actions): install, lint, test, build, gitleaks. Badge in README.
- Never mock away the thing being tested; mock only external services.

---

## 11. Git workflow

- `main` is always deployable. One branch per phase (`phase/2-magic-link`), merged with a merge commit so history stays readable. Tag `v1.0.0` at submission.
- Conventional Commits, small and frequent. `.gitignore` covers `node_modules`, `.env*` (except `.env.example`), uploads, build output.
- Husky + lint-staged (ESLint, Prettier) + commitlint + gitleaks pre-commit.

---

## 12. Deployment (evaluators must not have to reverse-engineer anything)

- **MongoDB Atlas** (free tier). **Render** web service running the Express server that also serves the React build. Add `/healthz` (liveness) and `/readyz` (DB reachable). Document an external keep-alive ping because free web services sleep (this also keeps Agenda running).
- **Deploy a walking skeleton by the end of Phase 1 (16 Oct)** and redeploy after every phase. Do not leave deployment to the last day.
- Document every environment variable (name, purpose, example format, where to get it) in the README and `.env.example`.
- Provide a **seeded demo firm** in production and **demo credentials in the README** (clearly marked as demo-only), plus one ready-to-open demo magic link. Optional: nightly demo-data reset when `DEMO_MODE=true`.
- Production must work with the real Gemini key, but the app must stay usable (manual entry) if the key or quota is exhausted.

---

## 13. Documentation deliverables

**README.md** must contain, in this order: Project Name, Problem Statement, Target Users, Solution, Key Features, Tech Stack, Architecture, Local Setup, Environment Variables, Deployment. Then add: Demo credentials, Screenshots, Testing, Security notes, AI usage and originality statement (built from scratch; list open-source libraries used; AI tools assisted development), Limitations and Roadmap.

**docs/**
- `ARCHITECTURE.md`: Mermaid diagrams (system overview, document lifecycle state machine, extraction sequence), module responsibilities, trade-offs.
- `DECISIONS.md`: running decision log.
- `API.md`: endpoint list with auth requirements and example payloads.
- `DEMO_SCRIPT.md`: a timed 3–5 minute script (problem → user → workflows → the invalid-invoice catch → export → close).
- `SETUP_ACCOUNTS.md`: step-by-step for the human: Atlas, Gemini key, cloud storage, SMTP, Render, GitHub; exact env var names.
- `SUBMISSION.md`: pre-filled with the form fields — Project Name, Student Name (placeholder), Problem Statement, GitHub Repository (placeholder), Deployed Application (placeholder), Demo Video (placeholder), Tech Stack, Major Features. Form: https://forms.gle/sBy4sfqyiRG2Zpom9
- `CHECKLIST.md`: the 14 final-checklist items from the guidelines, each with a link/evidence line.

---

## 14. Demo data

- `npm run seed` creates a realistic demo firm (e.g. "Sharma & Associates"), an owner and a staff user, ~8 clients, and checklists in varied states (complete, overdue, waiting, needs review).
- `scripts/generate-sample-docs.js` generates **synthetic** sample PDFs (no real PII, GSTINs with valid checksums), including **deliberately flawed ones** (wrong total, invalid GSTIN, duplicate invoice number, inter-state invoice with CGST/SGST) so the demo shows the validation engine catching real problems.

---

## 15. Phased plan and gates

| Phase | Dates | Scope | Gate |
|---|---|---|---|
| P0 Foundation | 13–14 Oct | Monorepo, tooling, CI, env validation, logging, error middleware, health routes, auth, RBAC, tenancy helper, React shell + login | Register → login → protected route works; tenancy test passes; CI green |
| P1 Clients and checklists (W1) | 15–16 Oct | Clients, templates, checklists, derived status, dashboard, staff invite; **first production deploy** | W1 acceptance criteria met; app live on Render |
| P2 Magic link and upload (W2) | 17–18 Oct | Token scheme, client page, storage adapter, upload validation, dedupe, activity feed | W2 acceptance met on a real phone browser |
| P3 Extraction, validation, review (W3) | 19–21 Oct | Extractor adapters, jobs, rules, confidence routing, review UI, audit log, bulk approve | W3 acceptance met incl. failure/retry paths |
| P4 Reminders and export (W4) | 22 Oct | Scheduler, email, WhatsApp link, CSV + ZIP export | W4 acceptance met. **FEATURE FREEZE** |
| P5 Hardening | 23 Oct | Error states, rate limits, security pass, test gaps, seed data, accessibility pass, production verification | Full error matrix tested; CI green; prod stable |
| P6 Docs | 24 Oct | README, diagrams, API.md, DEMO_SCRIPT, screenshots, SUBMISSION.md, CHECKLIST.md | All docs complete and accurate |
| P7 Submission | 25 Oct (+26–27 buffer) | Final QA in an incognito window; human records the demo video and fills the form | All links open without permissions. **No new features** |

If you fall behind, cut in this order: Tally XML, receipt type, activity-feed real-time (keep polling), ZIP export, staff assignment. Never cut tests, error handling, security, deployment or documentation.

---

## 16. Guideline compliance matrix

| Guideline section | How this project satisfies it |
|---|---|
| 1 Tech stack | MERN as required; every extra (Agenda, Zod, Gemini, Cloudinary) justified in `DECISIONS.md` |
| 2 What must be built | Full user → action → processing → state change → result flow in all four workflows |
| 3 Product expectations | Section 2: user, problem, actions, workflows, why-software, all repeated in the README |
| 4 Engineering depth | Auth/RBAC, persistent data, file handling, background jobs, scheduling, AI with validation, search/filter, notifications, caching by file hash |
| 5 Application logic | GST validation engine, balance reconciliation, confidence routing, state machines; AI is wrapped in engineering, not a bare API call |
| 6 Data and persistence | MongoDB model in Section 6 with real indexes |
| 7 Auth and authorization | Required because of private financial data; owner/staff/magic-link roles with tenancy isolation |
| 8 User experience | Section 9; loading/empty/success/error states everywhere |
| 9 Error handling | Section 8 matrix, each case tested |
| 10 Security | Section 7; no secrets in Git; hashed passwords; input validation; private files |
| 11 Git | Section 11; incremental Conventional Commits; branch per phase |
| 12 Deployment | Section 12; public URL, demo credentials, early deploy |
| 13 README | Section 13; all ten required sections in order |
| 14 Demo video | `DEMO_SCRIPT.md`, 3–5 min, shows the product working rather than code |
| 15 AI usage | Disclosed in README; the human reviews every phase and can explain the code |
| 16 Originality | Built from scratch; libraries and AI assistance disclosed |
| 17 What is not complete | Not static, not UI-only, not a tutorial clone, not plain CRUD, not an API wrapper, no half-working features |
| 18 Scope | Exactly 4 workflows, depth over breadth, explicit cut list |
| 19 Evaluation | Phases weighted toward core implementation (25%) and engineering logic (20%) |
| 20 Final submission | `SUBMISSION.md` pre-filled with every form field |
| 21 Checklist | `CHECKLIST.md` maps each of the 14 items to evidence |

---

## 17. Definition of done (whole project)

- All four workflows work end to end on the deployed app, not only locally.
- `npm test` and CI are green; the error matrix is covered; no secrets in the repo or history.
- README, docs and the submission file are complete; all links open in an incognito window.
- Seeded demo data and demo credentials work for a stranger on first visit.
- A reviewer can understand the architecture from `docs/ARCHITECTURE.md` in five minutes.

---

## 18. Start now

1. Read this prompt and the guidelines file fully.
2. Create `AGENTS.md`, `PLAN.md`, `PROGRESS.md`, `docs/DECISIONS.md`, `docs/SETUP_ACCOUNTS.md`.
3. Scaffold the monorepo and tooling, then begin Phase 0.
4. After each phase, print the phase report (Section 0, rule 10) and stop for the human to review before the next phase.