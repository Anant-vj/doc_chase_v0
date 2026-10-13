# API reference

All routes are prefixed `/api`. Private routes require the `session` cookie. Mutations require `X-DocChase: 1`; a supplied Origin must match APP_URL. The scheduled trigger instead requires its own secret. Errors return `{error:{code,message,requestId,details?}}`.

| Method | Path | Access / behavior |
|---|---|---|
| POST | /auth/register | Create firm and owner: firmName, name, email, password (10–72 chars) |
| POST | /auth/login | Email and password; HttpOnly cookie |
| GET | /auth/me | Session user and firm |
| POST | /auth/logout | Revoke current user sessions |
| GET | /overview | Tenant worklists, summary counts and recent activity |
| GET/POST | /clients | List / create client; name, contactPerson, email, E.164 phone, optional GSTIN/PAN |
| PATCH | /clients/:id | Update client, including remindersPaused |
| POST | /clients/:id/archive | Archive client and revoke their links |
| DELETE | /clients/:id | Owner only: remove private files and client data; associated sensitive audit data is removed for privacy |
| POST | /checklists | Client, title, ISO periodStart/periodEnd/dueDate, 1–12 required invoice items |
| GET | /checklists/:id | Derived checklist status and its document list |
| POST | /checklists/:id/link | New random checklist capability; raw token returned only on creation |
| POST | /checklists/:id/revoke-links | Revoke all existing links for this request |
| POST | /checklists/:id/items/:itemId/waive | Accountant waiver with reason |
| POST | /checklists/:id/reminder | Explicit email reminder attempt |
| PATCH | /checklists/:id/reminders | `{paused:boolean}` |
| GET | /documents | Tenant documents; optional status filter |
| GET | /documents/:id | Document, client and checklist |
| GET | /documents/:id/file | Private original; account/firm authorization required |
| POST | /documents/:id/validate | `{fields}` → deterministic validation flags |
| POST | /documents/:id/review | `{decision:'approve'|'reject',version,fields?,allowWarnings?,reason?}` |
| POST | /documents/:id/retry | Explicit retry for failed extraction |
| POST | /review/bulk | Revalidate and approve up to 100 clean documents; skip stale/flagged ones |
| GET | /exports?checklistId=... | UTF-8 BOM CSV; approved current versions only |
| GET | /reminders | Email attempt logs and configuration readiness |
| GET | /activity | Tenant-scoped append-only review/activity history |
| GET | /settings | Firm, team and provider readiness booleans; never credentials |
| POST | /settings/firm | Owner only: `{name}` |
| POST | /settings/staff | Owner only: `{name,email,password}`; no email invitation feature |
| POST | /jobs/tick | Owner-triggered local queue processing |
| POST | /internal/tick | X-Scheduler-Secret: process jobs and due reminders |
| GET | /portal/:token | Checklist-scoped client status; no extracted PII or storage keys |
| POST | /portal/:token/items/:itemId/upload | Multipart `file`; optional `supersedes` rejected document ID |
| POST | /portal/:token/items/:itemId/finish | Client confirms all invoices for a multiple-file item are sent |
| POST | /portal/:token/items/:itemId/unavailable | `{note}`; never auto-waives the item |
| GET | /samples/:name | Synthetic PDF download; demo mode only |

## Request example
```json
{"clientId":"CLIENT_ID","title":"September invoices","periodStart":"2026-09-01","periodEnd":"2026-09-30","dueDate":"2026-10-20","items":[{"label":"Purchase invoices","direction":"purchase","required":true,"multiple":true}]}
```

## Review example
```json
{"decision":"reject","version":2,"reason":"The second page of the invoice is missing."}
```
Approvals require invoice number, valid date, supplier name/GSTIN, taxable value and total. Errors block approval; warnings need explicit acknowledgment. A stale version returns 409, and a terminal document cannot be re-reviewed. Cross-firm resources return 404.
