# DocChase

**Stop chasing clients for documents.** An invoice-first document workspace for small accounting practices.

**Submission prototype:** real persisted collection, validation, review and export workflows, with deliberately small resource limits. Files are capped at 5 MB and the deployment has a cumulative 100 MB upload allowance. Pages update after your actions, when you return to a stale tab, or when you select Refresh; there is no periodic browser polling. An AI API key is optional. See [prototype behavior and costs](docs/PROTOTYPE.md).

## Problem statement
Client invoices arrive across messages and email, often late, duplicated or incomplete. Accountants need a clear checklist, a private collection link and an efficient review process before exporting reliable data.

## Target users
- Accounting firm owners and staff collecting and reviewing invoices.
- Clients sending documents from a phone without creating an account.

## Solution
Create a client-period request, share its expiring upload link, validate and review uploaded invoices, follow up on missing items, and export approved data. Human review controls approval; extraction is optional.

## Key features
1. Firm accounts, owner/staff permissions, client directory and document requests.
2. Checklist-scoped upload links, private files, file-type and size validation, duplicate protection and replacement uploads.
3. Invoice extraction adapters, deterministic validation, editable review, rejection reasons, optimistic concurrency and transactional audit history.
4. Scheduled/manual email reminders, WhatsApp click-to-send, pauses, quiet hours and approved-only CSV export.

## Tech stack
MongoDB, Express 5, React 19, Node 24, Mongoose, Zod, Vite, TanStack Query, React Router and Lucide icons. Purpose-built CSS, locally bundled DM Sans and Instrument Serif. Optional Gemini, private Supabase Storage and Brevo HTTPS email. Exact dependency versions are in workspace package files and package-lock.json.

MERN is our choice; the university permits any suitable stack.

## Architecture
A modular Express application serves the React production build. MongoDB persists firm-scoped data and a leased background queue. Storage, extraction and mail have local and hosted paths. The same worker can run in the web process or separately. See [architecture](docs/ARCHITECTURE.md) and [decisions](docs/DECISIONS.md).




## Local setup
For step-by-step Windows instructions, demo access, sample uploads and troubleshooting, see **[RUN_LOCALLY.md](RUN_LOCALLY.md)**.

Install Node **24.x**, then run from the project root in Windows PowerShell:
```powershell
npm.cmd ci
npm.cmd run dev
```
On macOS/Linux, use `npm` in place of `npm.cmd`. Stop an existing development run before reinstalling dependencies, and wait for installation to finish before starting the app.

Open **http://localhost:5173**. The first run downloads an official MongoDB runtime into `.cache/mongodb-binaries`; on Windows, the helper retrieves and checks only the executable, avoiding unused debug symbols. It starts a local single-member replica set with disk-backed data in `.local/mongo`, seeds fictional clients and starts both servers. No external accounts or API keys are needed. Restart the development command after backend changes.

Stop with Ctrl+C. Normal restarts retain the local data. Keep `.local` and `.cache` out of Git. A local replica set is required for atomic review/audit and upload/job transactions.

To generate synthetic PDF samples:
```powershell
npm run samples
```
They are written to `output/sample-documents`. Sample downloads are also available on the demo upload portal.

## Environment variables
`.env.example` documents all configuration names; it contains placeholders, not credentials. The application reads its process environment. Hosted deployments use provider environment settings. For a separately configured local server you may explicitly run `node --env-file=.env server/src/server.js` after creating your own environment file. Agents should never inspect that file.

| Variable | Purpose |
|---|---|
| NODE_ENV, PORT, APP_URL | Runtime mode, listening port and exact public origin |
| MONGODB_URI | Atlas or other MongoDB replica-set connection URI |
| JWT_SECRET | At least 32 random characters; required in production |
| RUN_WORKER | Run the durable queue with the web process (default true) |
| DEMO_MODE | Enable synthetic samples and allow fixture extraction |
| STORAGE_PROVIDER | `local` for development, `supabase` for production |
| UPLOAD_DIR | Local private file directory |
| MAX_FILE_SIZE_MB | Per-file limit, default 5 MB (maximum supported 10 MB) |
| UPLOAD_BUDGET_MB | Cumulative deployment-wide upload allowance, default 100 MB; deletion does not refund it |
| SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET | Server-only access to a **private** bucket |
| EXTRACTOR_PROVIDER | `manual`, `fixture` (demo only) or `gemini` |
| GEMINI_API_KEY, GEMINI_MODEL | Optional extraction credentials and model |
| DAILY_EXTRACTION_LIMIT | Per-firm daily extraction-attempt cap (default 40) |
| MAIL_PROVIDER, BREVO_API_KEY, MAIL_FROM | `console` or verified Brevo email sender |
| SCHEDULER_SECRET | At least 32 random characters for the scheduled trigger |

The local development command defaults to synthetic fixture extraction; other files go to manual entry. It never pretends an unknown document was extracted. Automatic extraction failures remain reviewable.

## Deployment
**Vercel and Render are excluded. Hosting must remain strictly free.** The prepared prototype path is Koyeb Free + Atlas Free + a private Supabase Storage bucket on the Free plan. The submission profile uses sample extraction/manual entry, no real email provider, and no recurring external scheduler or keep-alive requests. Sleeping and a cold start are acceptable for this prototype. See the [free deployment guide](docs/DEPLOYMENT.md).

No hosted URL is claimed until the account-dependent deployment is actually completed. The Dockerfile supports other standard Node/container hosts without changing the application.

Start with the [step-by-step deployment guide](docs/DEPLOY_STEP_BY_STEP.md), including the Koyeb account-plan check before payment. A Free instance is separate from signup eligibility.

## Demo credentials
Synthetic demo mode only:

| Role | Email | Password |
|---|---|---|
| Owner | owner@docchase.demo | DocChaseDemo!2026 |
| Staff | staff@docchase.demo | DocChaseDemo!2026 |

These credentials are intentionally public and must never grant access to real client data. All sample invoices and client records are fictional. Fixture extraction recognizes the supplied sample file hashes; it fails to manual entry for other documents.

## Testing
```powershell
npm run lint
npm test
npm run build
# Or all three:
npm run check
```
Unit tests cover validation, money reconciliation, financial-year duplicates, state transitions, checklist completion, quiet hours and safe CSV output. Integration tests use an actual isolated MongoDB replica set, covering auth, tenant isolation, CSRF, uploads, link scope, extraction, review, replacements, staff permissions and reminders. External services remain local adapters in these tests. CI runs checks and gitleaks.

Install [Gitleaks](https://github.com/gitleaks/gitleaks) for your operating system and run `git config core.hooksPath .githooks` to enable staged secret scanning before commits. The existing workspace also has a checksum-verified local scanner in the ignored `.cache/gitleaks` directory. The hook blocks commits if no scanner is available and redacts findings.

Browser QA evidence and screenshots belong in the ignored `output/playwright` directory; see [progress](PROGRESS.md) for verified results.

## Security notes
Session cookies are HttpOnly, same-origin and Secure in production. Mutations require a custom header and an accepted Origin. Client tokens are random 32-byte capabilities stored only as SHA-256 hashes. Firm IDs come from the authenticated session. Storage URLs and service credentials never go to the frontend. CSV string values are neutralized against spreadsheet formula injection. Review decisions and audit entries are transactional.

GST checks are screening rules for reviewers, not a certification of tax compliance. Model confidence is an extraction signal, not a calibrated probability. Public demos use synthetic files; Google’s unpaid Gemini terms advise against submitting sensitive or confidential information.

## AI usage and originality
This application was designed and implemented from scratch, utilizing AI assistance to streamline engineering, accelerate research, debug code, and draft documentation. All core workflows, validation logic, and architectural designs are original and project-specific. While open-source dependencies are managed in standard package files and industry design references informed the interface hierarchy, all code synthesis, asset selection, and product decisions were directed by the author.

## Limitations and roadmap
- Invoice extraction only; no bank/receipt extraction, payments, chat, template builder or Tally XML.
- Worklists are bounded to keep the student deployment responsive; introduce indexed cursor pagination before handling large firms. File contents are loaded into memory under the default 5 MB cap; replace this with streaming when required.
- Free hosts have sleep, quota and inactivity limits. The prototype has no external scheduler and does not promise unattended reminder delivery while the host is asleep. The optional email adapter is unconfigured by default.
- The 100 MB allowance is cumulative per database across all firms, includes seed documents, and is not refunded on deletion or failed/ambiguous storage attempts. Existing document sizes initialize the allowance on upgrade. It does not meter download bandwidth or other applications sharing your provider account.
- Reminder logs claim each slot once. Unconfirmed email delivery is flagged rather than blindly retried; an interrupted send may need provider reconciliation.
- No password recovery or self-service password changes in the first release. Public demo users are synthetic; this is not yet a production service for real financial documents.
- Account setup, a live provider verification, demo recording and submission remain human-dependent deliverables.
