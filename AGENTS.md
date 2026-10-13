# DocChase engineering instructions

- Read docs/END_TERM_PROJECT_GUIDELINES.md and docs/MASTER_BUILD_BRIEF.md before changing scope.
- Build the four invoice-first workflows in PLAN.md. No billing, chat, social features, Tally XML, or extra document extractors until the core works.
- MERN is our technology choice, not a university requirement. Use Node 24, JavaScript ESM, React, Express, MongoDB.
- The user requires strictly free hosting and excludes Vercel and Render. Do not create paid resources.
- Never read a real .env or print credentials. Commit .env.example with placeholders only. Never log documents, extraction contents, passwords, or magic tokens.
- Every firm resource query must include the authenticated firm ID. Client links are checklist-scoped. Files stay private.
- AI is optional: manual entry remains usable. Public demo documents must be synthetic. Never silently substitute fixture extraction for real documents.
- Design for accountants: restrained warm neutrals, forest green, legible tables, clear states, mobile-first client uploads. Avoid generic gradient hero sections, decorative charts, or AI marketing copy.
- Pin dependencies. Verify provider/library APIs with official documentation or Context7.
- Write meaningful unit/integration tests alongside workflow logic. Run lint, tests, and build before committing a phase. Keep genuine, logical commits; no arbitrary commit quota or rewritten history.
- Update PROGRESS.md and docs/DECISIONS.md with completed work, tradeoffs, verification and blockers. Continue authorized work between phase reports; account/secret-dependent steps can wait while local adapters run.
- Preserve deployment portability: one Express web application serving React; optional separate worker; storage, extraction and mail adapters. No microservices or Redis.
- Postman CLI is installed and available for API work.
