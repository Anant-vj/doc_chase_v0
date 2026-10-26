# Deploy DocChase: step by step

Order: check Koyeb account eligibility, prepare Atlas, prepare private storage, then finish Koyeb configuration. This guide does not claim that a deployment already exists.

## 1. Start with the Koyeb account check

1. Open [Koyeb](https://app.koyeb.com/) and select Sign up.
2. Choose Continue with GitHub and use the account containing `Anant-vj/doc_chase_v0`. Complete any identity/email confirmation.
3. Stop at the organization plan or payment screen. Basic user registration is free, but activating hosting has separate billing requirements. [Account documentation](https://www.koyeb.com/docs/reference/accounts).
4. Check whether **Starter** can be selected before any payment. Starter has no baseline subscription cost, but is usage-based and requires a valid payment method. A Free instance is a separate resource selection. [Organization plans](https://www.koyeb.com/docs/reference/organizations).
5. **Do not submit payment details yet.** The current pricing FAQ says signup selects Pro and entering a card can incur a prorated subscription charge, in addition to a $29 authorization hold. Paying first and downgrading later does not meet this project's strictly free requirement. [Billing FAQ](https://www.koyeb.com/docs/faqs/pricing).

Continue with Koyeb only after confirming an eligible zero-charge plan/resource path and accepting any verification requirements yourself. If onboarding forces a paid subscription, stop this host setup. The app's Dockerfile is portable; choosing another eligible host will not require rebuilding the product.

## 2. Prepare MongoDB Atlas Free

1. Open [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and create/sign into your account.
2. Create a project named `DocChase`.
3. Create a cluster and explicitly choose **Free** (formerly M0). Select a supported region near the web host when available. Confirm the resource is free before creating it. [Free cluster instructions](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/).
4. In Database & Network Access / Database Users, add a database user such as `docchase_app`. Generate a strong unique password and save it privately. Grant read/write privileges for the `docchase` database. This database user is separate from your Atlas website login. [Database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).
5. Configure Network Access for the web host's outbound addresses when available. If the free host does not provide a usable fixed address list, the synthetic prototype can use `0.0.0.0/0` with the strong database password and limited database role. That allows connections from any IPv4 address; authentication remains required. Restrict this before accepting real data. [IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
6. On the cluster choose Connect, then Drivers, then Node.js. Copy the supplied connection string privately.
7. Replace its database username/password placeholders. URI-encode special characters in the password. Set the database path to `/docchase` before the `?`, preserving the supplied query options. This value becomes `MONGODB_URI` in the host dashboard; never paste it into chat or commit it.

You do not need to manually create collections. The application initializes its models and demo records.

## 3. Prepare Supabase Free private storage

1. Open [Supabase](https://supabase.com/dashboard) and create/sign into your account.
2. Select a **Free organization** and create a project named `docchase`. Save its generated database password privately. Choose a nearby supported region.
3. Wait for project initialization, then open Storage and create a bucket named exactly `docchase-private`.
4. Keep the bucket **private**. Set its maximum upload size to **5 MB**, and its allowed MIME types to `application/pdf`, `image/jpeg`, `image/png`, and `image/webp`. [Bucket instructions](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
5. Copy the project's API URL, in the form `https://YOUR_PROJECT.supabase.co`. This becomes `SUPABASE_URL`.
6. Open Settings > API Keys. For the current adapter, copy the legacy **service_role** key into the host's `SUPABASE_SERVICE_ROLE_KEY` setting. It is a privileged server credential. Keep it out of frontend variables, GitHub and chat. Legacy keys continue to work unless disabled; newer secret keys have a separate migration path. [API key documentation](https://supabase.com/docs/guides/getting-started/api-keys).

DocChase uses this project for private file storage. The application records remain in Atlas. The backend authorizes access to files; keep the bucket private.

## 4. Configure the Koyeb web service

Only continue if section 1's budget check passed.

1. In Koyeb choose Create Web Service, then GitHub.
2. If prompted to install the Koyeb GitHub app, grant it access to the `doc_chase_v0` repository. Choose `Anant-vj/doc_chase_v0`, branch `main`. [GitHub deployment](https://www.koyeb.com/docs/build-and-deploy/deploy-with-git).
3. Configure the following project values:

| Setting | Value |
|---|---|
| App name | `docchase` (or another available name) |
| Service name | `web` |
| Service type | Web Service |
| Builder | Dockerfile |
| Work directory / build context | Repository root (`.`), not `client` or `server` |
| Dockerfile path | `Dockerfile` |
| Build target | Default/final stage |
| Entrypoint / command overrides | Leave unset; the Dockerfile defines startup |
| Instance | **Free**, explicitly selected |
| Region | Frankfurt or Washington, whichever offers the Free instance |
| Public port | `8000`, HTTP |
| Public route | `/` to port `8000` |
| Health check | HTTP GET `/readyz` on port `8000` |
| Initial health-check grace | `120` seconds, to allow demo initialization |

The Dockerfile builds React and serves the result through Express. One web service runs the complete application. Free availability and health-check configuration are documented by [Koyeb instances](https://www.koyeb.com/docs/reference/instances) and [health checks](https://www.koyeb.com/docs/run-and-scale/health-checks).

4. Add these non-secret environment values, without surrounding quotes:

```text
NODE_ENV=production
PORT=8000
STORAGE_PROVIDER=supabase
SUPABASE_BUCKET=docchase-private
DEMO_MODE=true
EXTRACTOR_PROVIDER=fixture
MAIL_PROVIDER=console
RUN_WORKER=true
MAX_FILE_SIZE_MB=5
UPLOAD_BUDGET_MB=100
```

5. Add the account-specific values directly in the host dashboard:

| Variable | Where its value comes from |
|---|---|
| `MONGODB_URI` | Atlas Drivers connection string, including `/docchase` |
| `SUPABASE_URL` | Supabase project's API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only legacy service_role key |
| `JWT_SECRET` | A new random secret, at least 32 characters |
| `SCHEDULER_SECRET` | A different new random secret, at least 32 characters |
| `APP_URL` | Your exact assigned public HTTPS origin, without a trailing slash |

To generate a secret privately in Windows PowerShell, this command copies a fresh random value to your clipboard. Paste it into the host's `JWT_SECRET` field, then run it again and paste the different value into `SCHEDULER_SECRET`. Do not share either value.

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

6. If Koyeb shows the assigned public domain in the creation form, use its full `https://...` origin for `APP_URL`. If the domain appears only after creation, leave `APP_URL` unset for the initial launch, then set it to the assigned origin and redeploy **before testing login or generating upload links**. The initial local-origin default is not the final configuration.
7. Confirm the organization plan, instance selection and displayed recurring cost match the free setup. Do not choose a paid instance, volume, custom domain or paid plan.
8. Deploy. Check both build and runtime logs. Demo mode initializes fictional evaluator accounts and clients automatically. Do not upload a real `.env` file.
9. Open the assigned domain's `/readyz` path. Expect a successful response containing `"ready":true`. Then open the app and choose Explore the sample workspace.

No AI key, real email key, external cron job, or keep-alive monitor is required for this prototype. Sample extraction is labelled; other documents use manual entry.

## 5. Verify and submit

1. Open the public app in an incognito window.
2. Create a client and request, share its link, and upload the supplied synthetic invoice from the client portal.
3. Mark the client's item finished. Use Refresh workspace to load it in the accountant view. Review, approve and export CSV.
4. Check the client portal's Refresh status control, an oversized-file failure, and retention of files/records after a service restart.
5. Add the live URL to README and SUBMISSION.md. Record a 3–5 minute product demo and verify source/app/video links without extra permissions.
6. Complete the [official form](https://forms.gle/sBy4sfqyiRG2Zpom9) before **27 October 2026, 11:59 PM IST**.

## Common deployment failures

| Symptom | Check |
|---|---|
| Plan/payment page requires Pro | Stop before payment; resolve host eligibility first |
| Build cannot find client files | Build context must be the repository root |
| Database unavailable | Atlas user/password, URI database name, network access |
| Private storage unavailable | Project URL, service_role key and exact private bucket name |
| Port or health-check failure | Public port and PORT must be 8000; readiness path `/readyz` |
| Login or mutations return 403 | APP_URL must exactly match the actual HTTPS origin; save and redeploy |
| Invalid configuration | JWT_SECRET and SCHEDULER_SECRET must each have at least 32 characters; all required host settings must be present |
| An idle visit takes a little longer | A sleeping free host needs time to wake |

Error text can be shared for debugging after removing credentials and upload tokens. Host account setup and live verification are still human-dependent; source publication alone does not deploy the app.
