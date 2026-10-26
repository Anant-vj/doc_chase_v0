# Progress

## 13 October 2026 — beginning implementation

- Read the complete project guidelines and master brief.
- User approved an invoice-first scope with four complete workflows and requested coding.
- Workspace is empty; Node 24.14.0 and npm 11.9.0 are available.
- User explicitly excludes Render/Vercel and requires strictly free hosting.
- Researching Koyeb and free VM alternatives; no external accounts or paid resources created.
- Established instructions, scope, plan and decision log before application code.

## Local core implementation
- Built firm authentication, owner/staff roles, tenant-scoped data, clients and invoice-period requests.
- Built private scoped uploads, file admission, duplicate hashes, explicit multiple-file completion, waivers and replacement versions.
- Built deterministic invoice rules, real/fixture/manual extraction adapters, durable Mongo job leases, quota reservations and a per-firm source-field cache.
- Built transactional review/audit, concurrency checks, reminder slot claims, Brevo HTTPS adapter, WhatsApp sharing and safe approved-only CSV export.
- Built the accountant workspace, side-by-side review and mobile portal with local fonts and purposeful CSS.
- Latest full gate: lint passed, 24 unit/integration tests passed, production build passed.
- Local app runs at http://localhost:5173. Browser QA is in progress; hot-reload root issue was corrected and invoice validation was exercised interactively.
- Prepared strictly free Koyeb/Atlas/private-storage deployment instructions and a portable Dockerfile. Cloud accounts, provider verification and actual publication are pending.

## Browser and reliability verification
- Completed desktop browser path: fictional client → monthly request → share link → phone-width upload → explicit client finish → accountant approval → complete request → downloaded CSV.
- Verified downloaded CSV contained the approved invoice and ₹11,800 total with the expected headers.
- Phone viewport: 360 px, document width 360 px; no horizontal overflow. Verified original PDF preview and live wrong-total validation; approval stayed disabled until the total was corrected.
- Corrected a development hot-reload root issue and improved visible validation reasons, field focus, accessible labels and persistent review actions.
- Tested restart retention of the development database, uploaded file, completed request and existing client capability. Corrected persisted replica-address handling without deleting the data.
- Final expanded gate: 26 unit/integration tests, lint and production build passed. Damaged images and oversized uploads are covered, as are optimistic review conflicts, tenant-scoped manual job processing, extraction cache, exhausted retries and quiet-hour slots.
- Gitleaks scanned committed history with redaction and reported no leaks; staged scanning is enabled through .githooks.
- Remaining human/account steps: create/connect free Koyeb, Atlas and private storage, configure optional real Gemini/email and scheduled trigger, publish the repository, verify the hosted app, record the demo and submit the form. No paid resources or real client data were used.

## Local run guide
- Added RUN_LOCALLY.md at the user's request and linked it from the README.
- Documented Windows setup, automatic local MongoDB startup, demo credentials, sample invoices, no-key behavior, persistent data, restart steps and common troubleshooting.
- Checked the instructions against the package scripts, development launcher, sample generator and Vite configuration. This is a documentation-only change.

## Clean-install startup repair
- The user reported a successful npm ci followed by ERR_MODULE_NOT_FOUND for mongoose/index.js during npm run dev. The deprecation notices in the install output were warnings, not the failure.
- A fresh clean install restored the missing Mongoose entry file. Also declared the root launcher's exact Mongoose version directly in the root devDependencies instead of relying on the server workspace's dependency being hoisted.
- Updated the Windows guide to use npm.cmd, explain successful installation output, stop development before reinstalling, and recover missing dependencies without deleting .local.
- Verified another clean npm.cmd ci, the documented Mongoose import check, lint, all 26 tests and the production build. The exact npm.cmd run dev command started successfully; frontend, API readiness, demo login and dashboard requests all returned HTTP 200.
- Stopped the verification run and confirmed ports 3001 and 5173 were available so the user can start the app from their own terminal. Existing development data was retained.

## 26 October 2026 — submission prototype resource controls
- User supplied Anant-vj/doc_chase_v0 and authorized publication of the existing Git history. Confirmed the public repository was empty, connected origin, and verified push access without forcing or uploading a replacement history.
- Removed periodic browser polling from overview, request details, client portal and pending review. Added explicit workspace/client refresh controls and a pending-invoice check action; retained refresh after local mutations and stale-tab focus.
- Enforced a default 5 MB file limit and a cumulative, atomic 100 MB deployment-wide upload allowance. Seed files use the same guard; existing document sizes initialize the allowance. Deletions and ambiguous failures deliberately do not refund it.
- Added five real-database storage tests for oversized writes, concurrent admission, persistence after deletion, existing-data initialization and API rejection without another stored object. Lint, all 31 tests and the production build passed.
- Demo-server startup now initializes fictional accounts idempotently. Docker/CI installation skips unused automatic MongoDB runtime downloads; tests acquire their pinned runtime when needed.
- Rewrote deployment guidance around the submission prototype: no required AI/email key, no external recurring scheduler or keep-alive, private persistent storage, explicit Free resources and conservative limits. Updated submission repository URL. Real hosted verification, video and form remain pending.
- Corrected the hosted-storage deletion endpoint to the documented bucket-level DELETE with JSON prefixes, so compensating cleanup uses the actual provider contract. Added a contract test with external requests mocked; final expanded gate passed lint, all 32 tests and the production build.
- In an isolated seeded server, both accountant and mobile-client pages made zero API requests over separate 30-second idle windows. Both Refresh controls worked; a synthetic phone-width upload and client completion appeared in the accountant overview, increasing review count from 4 to 5. The 360 px portal had a 360 px document width and displayed the 5 MB limit.
- Gitleaks scanned the existing committed history with redaction and found no leaks. Final publication verification is in progress. The user's running local instance was not restarted or modified by the isolated browser check.
