# Submission prototype: behavior and costs

DocChase is a working coursework prototype. Authentication, tenant isolation, private uploads, validation, editable review, rejection/replacement and CSV export use real application logic and persisted data. Live AI and email are optional integrations.

## Uploads

- Default maximum file size: **5 MB**, enforced before accepting the upload and again at the storage boundary.
- Default cumulative upload allowance: **100 MB across the whole application database**, including seed files and all firms.
- The allowance is reserved atomically in MongoDB, so simultaneous uploads cannot both spend the same remaining bytes. When exhausted, new uploads are refused; existing documents remain usable.
- Deletion and failed/ambiguous storage writes do not refund the allowance. This conservative policy bounds cumulative attempted storage writes, rather than measuring current disk occupancy. It also avoids unlimited upload/delete cycles.
- Upgrading an existing database initializes the counter from its existing document sizes. Files uploaded outside DocChase are not covered. Keep the application's allowance record and storage bucket with the database; do not reset metadata while retaining old objects.
- `MAX_FILE_SIZE_MB` and `UPLOAD_BUDGET_MB` configure these limits. Keep the defaults for submission.

For scale, 30 PDFs of 300 KB each are roughly 9 MB. Reopening a file also consumes download bandwidth; the upload allowance does not meter bandwidth. Use synthetic invoices only and inspect your provider's usage dashboard.

## Updates between accountant and client

There is no chat service, websocket, or periodic browser polling. Notes, file states and review decisions are stored in the database.

- Your own uploads, notes and review actions refresh the relevant data.
- Use **Refresh workspace** in the accountant header or **Refresh status** on the client page to see changes made by another person.
- Returning to a stale browser tab can refresh its active queries once.
- A queued invoice has a **Check again** action. Internal job processing continues while the app is awake; pending jobs recover after a restart.

An open, idle tab does not send status requests every few seconds. The submission profile does not configure an external scheduler or uptime pinger. Koyeb documents that its Free instance sleeps after an hour with no incoming traffic; a later visit wakes it. Normal use by an evaluator can keep it active during a demonstration. [Koyeb scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero).

## What the free plan means

The prepared deployment uses a Koyeb **Free** web instance, an Atlas **Free** cluster and Supabase **Free** private storage. Select these explicitly; paid trials and paid upgrades are outside this submission plan.

Supabase currently includes 1 GB of file storage and 5 GB egress on Free. These allowances are shared within the organization, so other projects matter. Its documentation says Free-plan users are not charged; excessive usage can lead to service restrictions. An app-level upload cap does not replace provider limits or account settings. [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [cost controls](https://supabase.com/docs/guides/platform/cost-control).

Koyeb documents a free web instance with sleep and resource limits. Atlas Free has fixed limits rather than automatic storage expansion. Verify your accounts are eligible and every selected resource shows a zero recurring cost. If signup requires an upgrade, stop and choose another eligible free option. No application code can guarantee the billing behavior of an account you upgrade. [Koyeb instances](https://www.koyeb.com/docs/reference/instances), [Atlas limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

## AI and messages

**No AI API key is needed for submission.** Use:

```text
DEMO_MODE=true
EXTRACTOR_PROVIDER=fixture
MAIL_PROVIDER=console
MAX_FILE_SIZE_MB=5
UPLOAD_BUDGET_MB=100
```

Fixture extraction recognizes only the supplied synthetic PDF hashes. It is labelled as sample extraction, not a live AI call. Unknown documents go to manual entry; invoice validation, review and export still work. Explain this in the demo video.

Real Gemini extraction later needs a server-side Gemini API key and available provider quota. Email later needs a configured, verified mail provider. Console mode does not send email; WhatsApp opens a prefilled message that a person chooses to send. Neither email delivery nor the optional AI integration is a university requirement. See [project guidelines](END_TERM_PROJECT_GUIDELINES.md).

Hosted database and private-storage credentials are still necessary. Store them in host environment settings. They are separate from an AI key and never belong in GitHub or chat.
