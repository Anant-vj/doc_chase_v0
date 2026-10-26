# Strictly free deployment

Prototype profile updated 26 October 2026. Provider limits can change; verify the dashboard before creating resources. Never choose an automatic paid upgrade. Vercel and Render are excluded by the user. See [prototype behavior and costs](PROTOTYPE.md).

For account creation and every dashboard setting, follow [the step-by-step guide](DEPLOY_STEP_BY_STEP.md). **Koyeb signup eligibility is conditional:** check the organization plan before payment. Its Free instance does not by itself guarantee a zero-charge new signup. The guide explains the current billing check before any hosting activation.

## Alternatives evaluated
| Provider | Free availability | Fit |
|---|---|---|
| [Koyeb](https://www.koyeb.com/docs/reference/instances) | One Free web instance per organization, 512 MB RAM, 0.1 vCPU, Frankfurt or Washington; sleeps after one hour | Primary prototype path. No external scheduler or keep-alive traffic. No persistent volumes or separate free worker. Account verification may require a payment method. |
| [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) | Eligible VM resources within Always Free limits | Alternative for a continuously running Node process. Requires VM administration; capacity may be unavailable and idle instances can be reclaimed. |
| [Railway](https://docs.railway.com/pricing/faqs) | One-time trial credit | A trial does not provide a dependable ongoing zero-cost deployment for this requirement. |
| [Fly.io](https://fly.io/docs/about/pricing/) | Usage-based pricing | Excluded from the zero-cost baseline. |

## Prepared primary stack
- Koyeb Free: one Node web service serves the SPA and API.
- [MongoDB Atlas Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/): application data and jobs, using a replica set for transactions.
- [Supabase Free](https://supabase.com/pricing): a private storage bucket; currently 1 GB storage and 5 GB uncached egress. Free projects may pause after one week of inactivity; limits apply to the whole project.
- [Brevo Free](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans): optional HTTPS transactional email, with verified sender; currently 300 emails per day. Confirm current quotas in your account before enabling.
- No external scheduler for submission. Leave cron jobs and uptime pingers unconfigured so they do not repeatedly wake the service.

## Setup
1. Use the repository [Anant-vj/doc_chase_v0](https://github.com/Anant-vj/doc_chase_v0), branch `main`. Keep the existing history. Do not commit a real `.env`.
2. Create an Atlas Free cluster and least-privilege database user. Configure network access for the host. Keep credentials in Koyeb environment settings. If broad IP access is necessary for the free host, use strong database credentials and explain the tradeoff.
3. Create a Supabase Free project and a **private** `docchase-private` bucket. Set its upload size limit to **5 MB** and permitted MIME types to PDF/JPEG/PNG/WebP. No public-read policies are needed: the backend authorizes access and uses its server-only key. Confirm the organization remains on Free.
4. In Koyeb, create a web service from this repository’s Dockerfile. Select the **Free** instance explicitly, a supported free region, port 8000 and `/readyz` HTTP health checks. Check the final cost is $0.
5. Configure the host environment using the table below. Enter secret values directly in the host dashboard; leave AI and email keys unset.
6. Use `DEMO_MODE=true`, `EXTRACTOR_PROVIDER=fixture`, `MAIL_PROVIDER=console`, `MAX_FILE_SIZE_MB=5`, and `UPLOAD_BUDGET_MB=100`. Supplied samples use labelled fixture extraction; other documents use manual entry. An AI API key is not needed.
7. The server initializes fictional demo users and clients at startup when `DEMO_MODE=true`, using the same configured database and storage. Existing demo accounts are not overwritten. The explicit `npm run seed` command remains available but is unnecessary for this deployment. Never reset real data.
8. Leave cron-job.org and other recurring schedulers unconfigured. Do not add a keep-alive monitor. The protected scheduler endpoint remains available for later use, but unattended delivery during host sleep is not part of the submission profile.
9. Optional email: verify a sender in Brevo, set `MAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `MAIL_FROM`, and test delivery to a permitted address. The app uses HTTPS, not SMTP ports. Without email, console-mode logs explicitly say nothing was sent and WhatsApp sharing remains available.
10. Open the app in an incognito window. Sign in with demo credentials, create a request, upload a synthetic invoice from a phone, choose Refresh to load another person's changes, review it and export CSV. Verify records and private files survive a host restart. Confirm an idle browser makes no recurring API calls; a later visit can wake the sleeping host.

### Required host settings

| Name | Submission value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8000` |
| `APP_URL` | Exact public HTTPS origin of the Koyeb service, without a trailing slash |
| `MONGODB_URI` | Your Atlas connection string, including a database name such as `docchase` |
| `JWT_SECRET` | At least 32 random characters, entered privately |
| `SCHEDULER_SECRET` | A separate random value of at least 32 characters, even though scheduling is unused |
| `STORAGE_PROVIDER` | `supabase` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | The server-only service-role key, entered privately |
| `SUPABASE_BUCKET` | `docchase-private` |
| `DEMO_MODE` | `true` |
| `EXTRACTOR_PROVIDER` | `fixture` |
| `MAIL_PROVIDER` | `console` |
| `RUN_WORKER` | `true` |
| `MAX_FILE_SIZE_MB` | `5` |
| `UPLOAD_BUDGET_MB` | `100` |

Do not paste placeholder keys from `.env.example`. Set only actual database/storage credentials in the dashboard. Leave `GEMINI_API_KEY` and `BREVO_API_KEY` unset. Client and accountant updates use the same server; no chat provider, websocket service or second server is needed.

## Free-tier operation
Never store hosted uploads on ephemeral container disk. MongoDB persists job state and the cumulative upload allowance; stuck job leases are reclaimed on the next processing tick after wake. Internal timers are not public keep-alive requests. There is no periodic browser polling. Free compute is suitable for evaluator traffic, not an uptime SLA. Check provider usage, including bandwidth and any other projects sharing the account. Supabase documents that Free-plan users are not charged, though usage restrictions may apply: [cost controls](https://supabase.com/docs/guides/platform/cost-control).

If Koyeb account eligibility or free capacity blocks deployment, the Docker image can run on an eligible Oracle Always Free VM. Configure HTTPS through a reverse proxy, keep ports private as appropriate, persist files in Supabase and use Atlas. Stay strictly within free shapes/volume/network allowances. Do not start a paid trial as a replacement without asking the user.

## Verification still required
Account eligibility, Atlas connectivity, private bucket behavior, and the final public URL can only be confirmed after actual account setup. The repository does not claim a completed cloud deployment. Gemini, verified email delivery, and an external scheduler are later opt-in integrations, not prerequisites for this submission prototype.
