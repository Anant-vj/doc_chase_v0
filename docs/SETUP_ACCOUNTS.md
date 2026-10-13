# Accounts needed before deployment

The local development path needs no accounts or API keys.

For a free hosted deployment, prepare a GitHub repository, MongoDB Atlas Free cluster, a Koyeb Free web service (one per organization, may require payment-method verification), and a private Supabase Storage bucket. Do not select paid resources.

Optional: Gemini for extraction of synthetic demo documents, Brevo for email delivery, cron-job.org for authenticated scheduled requests. The app remains useful with manual extraction and WhatsApp click-to-send.

Precise setup and environment variables will be documented with the implementation. Never paste secrets into chat or source files. Configure provider environment settings directly.
