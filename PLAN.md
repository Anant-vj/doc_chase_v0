# DocChase implementation plan

Target: ready 25 October 2026; official deadline 27 October 2026, 23:59 IST.

- [x] P0: workspace, CI, configuration, error contract, Mongo models, tenancy, authentication.
- [x] P1: clients, invoice checklists, derived completion, dashboard and usable navigation.
- [x] P2: expiring/revocable upload links, private files, file validation, duplicates, mobile portal.
- [x] P3: invoice extraction adapters, deterministic validation, durable jobs, human review and audit.
- [x] P4: reminder dispatch, approved-only CSV export, free-host deployment configuration.
- [x] P5: unit/integration coverage, browser QA at desktop/mobile, synthetic demo and local hardening.
- [x] P6: setup, architecture, deployment, demo and submission documentation.
- [ ] Account-dependent: choose/connect free host, Atlas, private storage, optional Gemini and email provider; deploy, record demo and submit form.

Phase gate: lint, tests and production build pass; update progress; make a logical commit.

Deferred: bank-statement/receipt extraction, template builder, email staff invitations, custom reminder plans, ZIP/Tally exports, real-time collaboration.
