# Engineering decisions

## 001 — Invoice-first scope
Keep setup, collection, invoice review, reminders and CSV export. Defer other extraction types and administration extras. The deadline rewards complete workflows rather than breadth.

## 002 — Portable modular monolith
Express serves the production React build. MongoDB stores application state and durable work. Storage, extraction and email use adapters; the worker can run with the web process or separately. Scaling should change deployment configuration before architecture.

## 003 — Free deployment is a hard constraint
Exclude Render and Vercel. Candidate: Koyeb Free + MongoDB Atlas Free + private Supabase storage + HTTPS email API, with an authenticated external scheduling request. Koyeb sleeps after one hour; scheduled work must survive process shutdown and execute on wake. A free VM is an alternative if account eligibility/capacity allows. No provider setup or spend is authorized by assumption.

## 004 — Design direction
Document tools such as Dext and Content Snare inform the workflow hierarchy. Use a warm paper background, forest-green navigation, tabular numbers, thin borders, restrained status colors and useful worklists. The client portal uses plain language and large touch targets. Reference products for patterns; do not copy their assets or code.

## 005 — Requirements versus preferences
MERN is a project decision. The university permits any stack and requires meaningful Git history, not 60 commits. Log real incremental work. Phase reports do not block already authorized implementation.

## 006 — Local development without secrets
Provide a development command that launches an isolated local MongoDB using mongodb-memory-server with disk-backed data. This is development-only; production requires a configured MongoDB URI and private cloud storage. Local storage and manual extraction need no accounts. Never read the human's .env.

## 007 — Small MongoDB leased queue instead of Agenda
Use a narrowly scoped durable queue with atomic claims, unique extraction keys, retry backoff and stale-lease recovery. The invoice-only workflow needs one job kind, and the free host has a small CPU allocation. This avoids extra scheduler configuration while retaining a separately runnable worker. The queue protocol has integration coverage. This deliberately deviates from the master brief's Agenda preference; the university does not prescribe a scheduler.

## 008 — Browser-native previews and purpose-built CSS
Use private same-origin PDF/image previews instead of a PDF.js dependency, with an open-original fallback. CSS primitives and locally bundled fonts provide the accounting desk design without a large component framework. These replace the brief's react-pdf/Tailwind/shadcn preferences to keep the first release focused.

## 009 — Honest external-delivery semantics
Reminder uniqueness claims a database slot, not exactly-once provider delivery. Failed/unconfirmed attempts are visible; ambiguous sends are not automatically repeated. HTTPS email avoids SMTP-host restrictions. Unconfigured email explicitly reports no-send.

## 010 — Summaries and cache for growth
Overview progress uses grouped MongoDB status counts instead of a truncated list of full documents. The review worklist uses projections. Extraction caching is firm-scoped and model-scoped, and preserves the original source fields separately from reviewed edits. This avoids repeating provider calls or reusing human edits as OCR data.

## 011 — Follow up only when the client has work to do
Stop document-chasing reminders when required items are submitted or the client has left a note awaiting staff review. Approval still determines final request completion. A rejection or an unfinished multiple-file item requires a client response again. This avoids chasing clients for a review delay inside the firm.

## 012 — Persistent local replica address
Store the local development replica-set port in ignored metadata. Recover an existing port from replica configuration without changing application collections. Reuse that address on restart, because stored replica membership cannot follow randomly chosen ports. Wait for API readiness before launching the frontend; redact capability tokens from development proxy errors.

## 013 — Declare the launcher's dependencies directly
The root development launcher imports Mongoose, so the root package must declare the same pinned version as a development dependency. The server retains its runtime dependency. Do not rely on workspace hoisting to make an undeclared root import available. Verify local setup after a clean `npm ci`, and document warnings separately from failures and missing-package recovery without deleting application data.

## 014 — Bounded submission prototype, 26 October 2026
The user prioritizes a strictly free coursework prototype and defers production scale. Supersede the original always-current browser and external-scheduler preferences: use explicit Refresh, invalidation after local actions and stale-tab focus refresh, with no periodic browser polling or default external cron job. Internal queue timers do not send public keep-alive requests and stop when the host sleeps. Accept cold starts and defer guaranteed unattended reminders.

Limit files to 5 MB and reserve a cumulative 100 MB upload allowance atomically in a deployment-wide MongoDB infrastructure record. Include existing document sizes on initialization and all seed writes. Do not refund deletions or ambiguous failures: this intentionally conservative admission guard bounds repeated writes without introducing billing, cleanup workers or distributed storage-accounting infrastructure. It does not meter bandwidth or other projects' usage. Keep real AI and email optional; use clearly identified synthetic sample extraction and manual entry. Seed fictional demo data idempotently on demo-server startup so evaluator accounts work after a fresh deployment. Do not provision paid resources or claim a cloud deployment before it exists.

## 015 — Account billing eligibility precedes host activation
On 26 October the current Koyeb billing FAQ exposed a new-signup plan risk that the Free-instance documentation alone did not resolve. The user has not created an account. Basic registration can proceed, but payment and service activation must wait until a zero-charge eligible path is confirmed. Do not treat paying for Pro and later downgrading as meeting the user's strictly free requirement. Keep the Dockerfile portable and document the complete deployment steps with this account check first.
