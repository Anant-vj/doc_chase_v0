# Strictly free deployment

Researched 13 October 2026. Provider limits can change; verify the dashboard before creating resources. Never choose an automatic paid upgrade. Vercel and Render are excluded by the user.

## Alternatives evaluated
| Provider | Free availability | Fit |
|---|---|---|
| [Koyeb](https://www.koyeb.com/docs/reference/instances) | One Free web instance per organization, 512 MB RAM, 0.1 vCPU, Frankfurt or Washington; sleeps after one hour | Primary coursework path, with durable jobs and a real scheduled request. No persistent volumes or separate free worker. Account verification may require a payment method. |
| [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) | Eligible VM resources within Always Free limits | Alternative for a continuously running Node process. Requires VM administration; capacity may be unavailable and idle instances can be reclaimed. |
| [Railway](https://docs.railway.com/pricing/faqs) | One-time trial credit | A trial does not provide a dependable ongoing zero-cost deployment for this requirement. |
| [Fly.io](https://fly.io/docs/about/pricing/) | Usage-based pricing | Excluded from the zero-cost baseline. |

## Prepared primary stack
- Koyeb Free: one Node web service serves the SPA and API.
- [MongoDB Atlas Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/): application data and jobs, using a replica set for transactions.
- [Supabase Free](https://supabase.com/pricing): a private storage bucket; currently 1 GB storage and 5 GB uncached egress. Free projects may pause after one week of inactivity; limits apply to the whole project.
- [Brevo Free](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans): optional HTTPS transactional email, with verified sender; currently 300 emails per day. Confirm current quotas in your account before enabling.
- [cron-job.org](https://cron-job.org/en/faq/): a real scheduled request every 15 minutes with a custom secret header. This endpoint dispatches work, rather than serving as a fake keep-alive.

## Setup
1. Put this repository on GitHub with its existing history. Do not commit a real `.env`.
2. Create an Atlas Free cluster and least-privilege database user. Configure network access for the host. Keep credentials in Koyeb environment settings. If broad IP access is necessary for the free host, use strong database credentials and explain the tradeoff.
3. Create a Supabase Free project and a **private** `docchase-private` bucket. Set its upload size limit to 10 MB and permitted MIME types to PDF/JPEG/PNG/WebP. No public-read policies are needed: the backend authorizes access and uses its server-only key.
4. In Koyeb, create a web service from this repository’s Dockerfile. Select the **Free** instance explicitly, a supported free region, port 8000 and `/readyz` HTTP health checks. Check the final cost is $0.
5. Configure `NODE_ENV=production`, `PORT=8000`, `APP_URL=https://YOUR-SERVICE.koyeb.app`, `MONGODB_URI`, a random `JWT_SECRET`, `STORAGE_PROVIDER=supabase`, Supabase URL/key/bucket, and a separate random `SCHEDULER_SECRET`.
6. For the synthetic evaluator demo use `DEMO_MODE=true`, `EXTRACTOR_PROVIDER=fixture`, `MAIL_PROVIDER=console`. For a real extraction demonstration configure Gemini and switch the extractor to `gemini`, while continuing to use synthetic documents. The default `gemini-3.5-flash-lite` is listed with a free tier in the [official pricing](https://ai.google.dev/gemini-api/docs/pricing); confirm access and free quotas in your account. Older 2.5 models have access restrictions for new projects. Provider privacy policy is a separate decision before accepting real client documents. Do not enable billing to bypass a free-quota failure.
7. Seed the demo once against those same configured Atlas/storage resources with `DEMO_MODE=true npm run seed` (use your shell’s environment syntax). The command exits without changing an already-seeded demo. Never run a destructive data reset against real data.
8. Configure cron-job.org to **POST** `https://YOUR-SERVICE.koyeb.app/api/internal/tick` every 15 minutes, with `X-Scheduler-Secret` set to the secret from Koyeb. No browser session or CSRF header is used on this endpoint. Confirm unauthorized requests return 403.
9. Optional email: verify a sender in Brevo, set `MAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `MAIL_FROM`, and test delivery to a permitted address. The app uses HTTPS, not SMTP ports. Without email, console-mode logs explicitly say nothing was sent and WhatsApp sharing remains available.
10. Open the app in an incognito window. Sign in with demo credentials, create a request, upload a synthetic invoice from a phone, review it and export CSV. Verify external scheduling and recovery after a host restart.

## Free-tier operation
Never store hosted uploads on ephemeral container disk. MongoDB persists job state; stuck job leases are reclaimed on the next processing tick. The external scheduler must be configured before claiming unattended reminder functionality. Free compute is suitable for evaluator traffic, not an uptime SLA.

If Koyeb account eligibility or free capacity blocks deployment, the Docker image can run on an eligible Oracle Always Free VM. Configure HTTPS through a reverse proxy, keep ports private as appropriate, persist files in Supabase and use Atlas. Stay strictly within free shapes/volume/network allowances. Do not start a paid trial as a replacement without asking the user.

## Verification still required
Account eligibility, Atlas connectivity, private bucket behavior, Gemini extraction if enabled, sender verification, scheduled delivery, and the final public URL can only be confirmed after actual account setup. The repository does not claim a completed cloud deployment.
