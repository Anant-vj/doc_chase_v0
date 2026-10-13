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
