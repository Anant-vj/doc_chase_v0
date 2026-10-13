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
