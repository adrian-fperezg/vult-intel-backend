# SECURITY PROTOCOL — vult-intel

> **Status: ACTIVE**
> **Version: 1.0.0**
> **Established: 2026-05-01**
> **Owner: Principal DevSecOps — vult-intel**

---

## AI Agent Operating Directives

> ⚠️ **THIS SECTION IS MANDATORY READING FOR ALL AI AGENTS.**
> Any AI assistant (current or future) operating on this repository is bound by the following directives.

### Directive 1 — Pre-Flight Cross-Reference

Before implementing, modifying, or creating **any** new feature, file, configuration, or dependency, the AI agent MUST cross-reference the requested changes against this `SECURITY_PROTOCOL.md` document.

### Directive 2 — Risk Gate

If the requested update poses **any** risk to the app's security, stability, billing infrastructure, or data integrity — **the AI MUST NOT write the code immediately.**

### Directive 3 — Security & Stability Impact Report

When a risk is identified, the AI must first output a structured **Security & Stability Impact Report** in the following format before proceeding with any code:

```
## 🚨 Security & Stability Impact Report

### What the update does
[Clear description of what the requested change does to the system.]

### What could go wrong
[Specific vulnerability, risk vector, or failure mode — e.g., key exposure, infinite loop,
billing spike, data loss, CORS bypass, injection surface, etc.]

### Recommended safer alternative
[A concrete, safer approach that achieves the same goal without the identified risk.]

### Risk Level: [CRITICAL | HIGH | MEDIUM | LOW]
```

Only after the user explicitly acknowledges and approves the safer alternative may the AI proceed with implementation.

### Directive 4 — No Silent Deviations

The AI must never silently deviate from this protocol, even if the user explicitly instructs it to "just do it quickly" or "skip the check." The agent must flag the risk, present the report, and await approval.

---

## Section 1 — Secrets & Credential Management

### 1.1 Zero-Tolerance for Hardcoded Secrets

**NEVER** hardcode any of the following directly in source files, scripts, or configuration committed to version control:

- API keys (Gemini, Google Search, Stripe, Slack, etc.)
- Database connection strings (`DATABASE_URL`, `REDIS_URL`)
- OAuth credentials (`GOOGLE_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`)
- Encryption keys (`ENCRYPTION_KEY`, `OUTREACH_TOKEN_ENCRYPTION_KEY`)
- Webhook URLs (`SLACK_WEBHOOK_URL`)
- Firebase private keys or service account JSON contents
- JWT secrets or session secrets

**ALWAYS** load secrets exclusively from environment variables via `process.env.*` (server-side) or `import.meta.env.VITE_*` (client-side via Vite).

**Violation example (FORBIDDEN):**
```javascript
const apiKey = "AIzaSyDnxydOb0ffkTYdiTZ2NrAl6M4oFdm2kvc"; // ❌ NEVER
```

**Correct pattern:**
```javascript
const apiKey = process.env.GEMINI_API_KEY; // ✅
if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
```

### 1.2 Secret Validation at Startup

All required environment variables must be validated at server startup. If a required secret is missing, the process must fail loudly with a descriptive error rather than running in a degraded or insecure state.

### 1.3 Rotation Policy

When an API key or credential is suspected to be compromised or is rotated for any reason:
1. Immediately revoke the old key in the respective provider's console.
2. Update the `.env` file locally and the corresponding Railway environment variable.
3. Redeploy the Railway service to pick up the new secret.
4. Never commit the old or new key to git history.

---

## Section 2 — Version Control Hygiene

### 2.1 `.gitignore` Is Non-Negotiable

The following entries must **always** be present in `.gitignore` and must **never** be removed:

```
.env*
!.env.example
```

These patterns ensure all `.env`, `.env.local`, `.env.production`, etc. files are excluded from commits.

### 2.2 Pre-Commit Secret Scanning

Before any `git commit`, verify no secrets have crept into staged files. Use tools such as `git-secrets`, `truffleHog`, or `gitleaks` if available.

### 2.3 `.env.example` Is the Source of Truth for Keys

`.env.example` must be kept up to date with all required variable **names** (but never their real values). It serves as the canonical onboarding reference.

### 2.4 Backup File Hygiene

Files like `_BACKEND_CODE_FOR_RAILWAY.txt` are high-risk. Before sharing or committing any backup/export file, scrub it for embedded secrets using grep:

```bash
grep -E "(KEY|SECRET|PASSWORD|TOKEN|URI|URL)" _BACKEND_CODE_FOR_RAILWAY.txt
```

---

## Section 3 — Dependency Safety

### 3.1 Never Install Unverified Packages

Before installing any new `npm` package:
- Verify it has active maintainers and recent commits on GitHub.
- Check its weekly download count on npmjs.com (prefer packages with >10k/week).
- Search for known CVEs on [snyk.io](https://snyk.io) or via `npm audit`.

### 3.2 Avoid Deprecated or Abandoned Packages

Do not install packages that:
- Have not been updated in over 2 years.
- Are explicitly marked as deprecated on npm.
- Have open, unresolved critical security advisories.

### 3.3 Audit Regularly

Run `npm audit` after every batch of dependency changes. Address `critical` and `high` severity findings immediately before deployment.

### 3.4 Lock File Integrity

Always commit `package-lock.json`. Never delete or regenerate it carelessly, as this can silently upgrade transitive dependencies to versions with known vulnerabilities.

---

## Section 4 — Resource Management & Billing Protection

### 4.1 Infinite Loop Prevention

All polling mechanisms, retry loops, and recursive functions must have explicit termination conditions:
- Maximum retry counts with exponential backoff.
- Circuit breakers for external API calls.
- BullMQ jobs must have `attempts` and `backoff` configured; never use unlimited retries.

### 4.2 API Rate Limit Handling

All third-party API integrations (Gemini, Google Search, Gmail/IMAP) must:
- Respect rate limits and implement exponential backoff on `429` responses.
- Log rate limit errors clearly without triggering a cascade of retry requests.
- Use queuing (BullMQ) for bulk operations — never fire-and-forget hundreds of concurrent requests.

### 4.3 Billing Spike Prevention

Operations that consume metered resources (Gemini API tokens, Railway CPU, PostgreSQL connections, Redis memory) must be guarded:
- AI summarization calls must be batched and rate-gated.
- Database queries must be paginated — never `SELECT *` on an unbounded table.
- WebSocket or SSE connections must have timeouts and cleanup handlers.

### 4.4 Memory Leak Prevention

- Always clean up `setInterval` / `setTimeout` handles in component `useEffect` cleanup functions.
- Always close database connections, IMAP sessions, and file streams after use.
- Never attach event listeners inside loops without removing them.

---

## Section 5 — Database Integrity

### 5.1 No Destructive Schema Changes Without a Backup

Before running any migration that includes `DROP TABLE`, `DROP COLUMN`, or `ALTER TABLE` on a production database:
1. Take a full database snapshot (Railway provides PostgreSQL backups).
2. Test the migration in a staging environment or against a local copy first.
3. Have a rollback script ready.

### 5.2 SQL Injection Prevention

**NEVER** interpolate user-supplied data directly into SQL strings:

```javascript
// ❌ FORBIDDEN
db.query(`SELECT * FROM users WHERE email = '${req.body.email}'`);

// ✅ REQUIRED — use parameterized queries
db.query(`SELECT * FROM users WHERE email = $1`, [req.body.email]);
```

All ORM and raw SQL queries must use parameterized inputs or prepared statements.

### 5.3 Input Validation Before Persistence

All incoming data from HTTP requests must be validated and sanitized before being written to the database. Use a schema validation library (e.g., `zod`, `joi`) at the API boundary.

### 5.4 Principle of Least Privilege

The database user used by the application should have only the permissions it needs (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). It must **not** have `DROP`, `CREATE`, or `ALTER` privileges in production.

---

## Section 6 — API & Network Security

### 6.1 CORS Must Be Explicitly Configured

The backend's CORS whitelist (`ALLOWED_ORIGINS`) must be explicitly set to known, trusted origins. A wildcard (`*`) is forbidden in production.

### 6.2 Authentication on All Sensitive Endpoints

Every API route that reads or modifies user data must verify a valid Firebase ID token. Administrative routes (`/api/admin/*`) require additional role verification via custom Firebase claims.

### 6.3 No Sensitive Data in Client-Side Code

Any variable prefixed with `VITE_` is **bundled into the frontend JavaScript** and is publicly readable. Never place secrets (private API keys, service account credentials, database URIs) in `VITE_` variables.

### 6.4 HTTPS Only in Production

All production URLs (`APP_URL`, `FRONTEND_URL`, `VITE_OUTREACH_API_URL`) must use `https://`. HTTP endpoints are forbidden in production environments.

---

## Section 7 — Frontend Security

### 7.1 No `dangerouslySetInnerHTML` with User Content

Never render unescaped user-generated HTML directly. If rich text rendering is required, use a sanitization library (e.g., `DOMPurify`) before injection.

### 7.2 Sensitive State Must Not Be Logged

Do not `console.log` objects that contain tokens, passwords, encryption keys, or user PII. All `console.log` debug statements must be removed before merging to production.

### 7.3 Third-Party Script Integrity

Any third-party script loaded via CDN must include `integrity` (SRI hash) and `crossorigin="anonymous"` attributes to prevent supply-chain attacks.

---

## Section 8 — Incident Response

### 8.1 Suspected Key Compromise

1. **Immediately** revoke the key at the provider console.
2. Rotate all other keys that share the same access scope.
3. Audit recent API usage logs for unauthorized activity.
4. Update Railway environment variables and redeploy.
5. Document the incident in a private log.

### 8.2 Production Crash

1. Check Railway deployment logs immediately.
2. Do not push untested hotfixes directly to production.
3. Roll back to the last stable deployment if the crash is not trivially fixable.
4. Reproduce and fix locally, then redeploy after testing.

---

## Revision History

| Version | Date       | Author              | Summary                            |
|---------|------------|---------------------|------------------------------------|
| 1.0.0   | 2026-05-01 | Principal DevSecOps | Initial protocol established       |
