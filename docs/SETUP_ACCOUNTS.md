# Accounts needed before deployment

The local development path needs no accounts or API keys.

For a free hosted deployment, prepare a GitHub repository, MongoDB Atlas Free cluster, a Koyeb Free web service (one per organization, may require payment-method verification), and a private Supabase Storage bucket. Do not select paid resources.

Before activating Koyeb, complete the account-plan check in the [step-by-step guide](DEPLOY_STEP_BY_STEP.md). New-signup eligibility must be confirmed before entering payment details; a Free instance alone is insufficient.

For submission use `DEMO_MODE=true`, `EXTRACTOR_PROVIDER=fixture`, `MAIL_PROVIDER=console`, `MAX_FILE_SIZE_MB=5`, and `UPLOAD_BUDGET_MB=100`. No AI or email API key is needed. Do not create an external cron job or keep-alive monitor for this prototype. See [prototype behavior](PROTOTYPE.md).

The [deployment guide](DEPLOYMENT.md) lists the required hosting settings. Atlas database credentials and the private storage server key are still required for a hosted app; they are separate from an AI key. Never paste secrets into chat or source files. Configure provider environment settings directly.
