# Run DocChase locally

This guide is for Windows PowerShell. You can run the complete demo without cloud accounts, API keys, a `.env` file, Docker, or a separate MongoDB installation.

## 1. Check Node.js

Install **Node.js 24.x**, then open a new PowerShell terminal and check:

```powershell
node --version
npm --version
```

The Node version should begin with `v24.`. Use the commands below from the **project root**, which contains `package.json`.

## 2. Install dependencies

```powershell
Set-Location -LiteralPath 'C:\Users\anant\Desktop\SST\Year 2\Term 5\mern_end_poject'
npm ci
```

Run this on your first setup, or after pulling changes to `package-lock.json`. You do not need to reinstall dependencies every time you start the app.

## 3. Start the app

```powershell
npm run dev
```

Leave this terminal open. The command starts:

- A local MongoDB replica set and persistent database.
- The Express API and background worker on port **3001**.
- The React development server on port **5173**.
- Fictional demo users, clients, and document requests on the first run.

The first startup needs an internet connection to download the official MongoDB runtime. Allow the download and database startup to finish; later starts reuse the cached runtime.

Once the terminal shows the Vite server is ready, open **[http://localhost:5173](http://localhost:5173)**. Use this exact address for the local app.

For this setup, use `npm run dev`. The separate `npm start` command is for a configured server with an available database and a built frontend.

## 4. Sign in

Click **Explore the sample workspace** on the login page to sign in as the demo owner, or enter these credentials:

| Role | Email | Password |
|---|---|---|
| Owner | `owner@docchase.demo` | `DocChaseDemo!2026` |
| Staff | `staff@docchase.demo` | `DocChaseDemo!2026` |

These are intentionally public demo credentials for fictional data.

## 5. Try the complete workflow

1. Open a client and create an invoice request for a period.
2. Copy its client upload link and open it in a new browser tab or private window.
3. Upload a supplied sample invoice. Use **I've sent everything** after finishing the client's uploads.
4. Return to the accountant workspace, open the invoice review, check or edit the fields, and approve it.
5. Export the approved invoice data as CSV.

You can download sample PDFs from the demo upload portal. To generate the same samples as local files, open a **second PowerShell terminal** in the project root and run:

```powershell
npm run samples
```

The files appear in **`output/sample-documents`**.

### What works without API keys

- Login, clients, requests, private upload links, document uploads, review, replacements, and CSV export all work locally.
- Supplied synthetic samples have fixture extraction so you can exercise the review workflow. Other files go to manual entry; they are not sent to an AI provider by this setup.
- Email defaults to an unconfigured local adapter, so real reminder emails are not delivered. A live mail provider is optional and configured separately.
- The client portal is responsive. To try its phone layout on this computer, use your browser's responsive/device mode. The development server listens on this computer's loopback address, so a physical phone cannot use your computer's `localhost` URL.

## 6. Stop and restart

Press **Ctrl+C** in the terminal running the app, then wait for it to stop. Start it again from the project root with:

```powershell
npm run dev
```

Normal restarts retain your clients, requests, reviews, and uploaded files. Sign in again after restarting: the local session signing key changes on each run.

Frontend changes update automatically. After editing backend files, stop and restart `npm run dev`.

### Where local files live

| Location | Contents |
|---|---|
| `.local/mongo` | Your development database |
| `.local/mongo-port.json` | The database's saved replica-set port |
| `.local/uploads` | Uploaded documents, with the default configuration |
| `.cache/mongodb-binaries` | Downloaded MongoDB runtime |
| `output/sample-documents` | Generated fictional invoice PDFs |

Keep `.local` if you want to retain your work. These runtime and output folders are ignored by Git.

## Useful commands

Run these in another terminal from the project root:

| Command | Purpose |
|---|---|
| `npm run lint` | Check JavaScript code |
| `npm test` | Run unit and integration tests using an isolated test database |
| `npm run build` | Build the frontend into `client/dist` |
| `npm run check` | Run lint, tests, and build together |
| `npm run samples` | Generate synthetic invoice PDFs |

`npm run build` creates production files; it does not start the local app. Demo seeding happens automatically during `npm run dev`, so you do not need to run `npm run seed` separately.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `node` or `npm` is not recognized | Install Node.js 24.x and reopen your terminal. |
| PowerShell says `npm.ps1` cannot run because scripts are disabled | Use `npm.cmd ci` and `npm.cmd run dev`. You can replace `npm` with `npm.cmd` in the other commands too. |
| `npm ci` cannot find `package.json` | Run `Set-Location` from step 2, then retry. |
| The browser cannot connect | Check that the terminal running `npm run dev` is still open and startup has finished. Use `http://localhost:5173`. |
| Port 5173 or 3001 is already in use | Stop the previous DocChase run with Ctrl+C in its terminal. If another app uses the port, close that app before retrying. Run only one DocChase development instance against this local database. |
| The MongoDB runtime download fails | Check your connection and access to `fastdl.mongodb.org`, then retry `npm run dev`. Do not delete `.local` to troubleshoot a download. |
| You are signed out after a restart | Sign in again with the demo credentials; your saved data remains available. |
| An uploaded invoice needs manual entry | Use a supplied sample PDF for fixture extraction, or enter the fields manually for your own document. |
| A backend change does not appear | Stop and restart `npm run dev`. |
| A reminder does not arrive by email | The default local setup does not deliver real email. See the deployment guide for optional mail configuration. |

For architecture, configuration, and hosting details, see [README.md](README.md), [architecture](docs/ARCHITECTURE.md), and the [free deployment guide](docs/DEPLOYMENT.md).
