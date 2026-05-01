# SECURITY PROTOCOL — vult-intel

> **Status: ACTIVE**
> **Version: 1.1.0**
> **Established: 2026-05-01**
> **Last Updated: 2026-05-01**
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

### Directive 5 — Google Policy Self-Update Mandate

Section 9 of this document (Google Platform Policy Compliance) must be treated as a **living document**. The AI agent is responsible for keeping it current:

- **Trigger:** Whenever a new feature touches a Google API (Gemini, Search, Gmail, Firebase, Google Cloud), the AI must verify that Section 9 still reflects the latest published policies before writing any code.
- **Sources to check:**
  - Gemini / Generative AI: `https://ai.google.dev/gemini-api/terms` and `https://policies.google.com/terms/generative-ai/use-policy`
  - Google APIs general ToS: `https://developers.google.com/terms`
  - Google API Services User Data Policy: `https://developers.google.com/terms/api-services-user-data-policy`
  - Google Custom Search / PSE: `https://developers.google.com/custom-search/v1/overview`
  - Gmail API scopes: `https://developers.google.com/gmail/api/auth/scopes`
  - Firebase ToS: `https://firebase.google.com/terms`
  - Google Cloud AUP: `https://cloud.google.com/terms/aup`
- **Action:** If any policy has changed, the AI must update Section 9 and bump the `Last Updated` date in the header, then commit the change with message `docs: sync google policy compliance — <YYYY-MM-DD>` before proceeding with the feature.

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

## Section 9 — Google Platform Policy Compliance

> ⚠️ **This section is a living document.** It must be updated every time Google publishes changes to the policies listed under Directive 5. The `Last Updated` date in the file header must be bumped on every revision.

This project integrates the following Google services: **Gemini API**, **Google Custom Search API**, **Gmail API (OAuth 2.0)**, **Firebase** (Auth, Firestore, Hosting), and **Google Cloud** (Railway runs on GCP infrastructure). All usage is governed by Google's policy stack. The rules below are non-negotiable.

---

### 9.1 — Gemini API & Generative AI Prohibited Use Policy

**Source:** [Google Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy) · [Gemini API Terms](https://ai.google.dev/gemini-api/terms)

This project uses `GEMINI_API_KEY` to power AI-assisted intelligence features. The following uses are **absolutely forbidden**:

#### 9.1.1 Dangerous or Illegal Content Generation
- Generating or assisting in generating content related to **child sexual abuse or exploitation (CSAE)** in any form.
- Facilitating or promoting **violent extremism or terrorism**.
- Creating **non-consensual intimate imagery (NCII)**.
- Providing synthesis or acquisition instructions for **illegal substances, weapons, or controlled goods**.
- Encouraging or facilitating **self-harm or suicide**.

#### 9.1.2 Security Compromise via AI
- Using Gemini to generate **malware, viruses, ransomware, exploit code, or phishing content**.
- Directing Gemini to perform or assist **unauthorized access** to any system.
- **Prompt injection attacks** — crafting inputs designed to bypass Gemini's safety filters or override its system instructions.
- Attempting to **circumvent abuse protections or technical guardrails** in any Google AI service.

#### 9.1.3 Harmful or Hateful Content
- Generating content that promotes **hate speech or discrimination** based on protected characteristics (race, religion, gender, sexual orientation, disability, national origin, etc.).
- Creating content that **bullies, harasses, intimidates, or abuses** individuals or groups.
- Generating content that **incites or glorifies violence**.
- Producing **sexually explicit or pornographic** content.

#### 9.1.4 Misinformation & Deception
- Using Gemini to produce **fraudulent, scam, or deceptive content** of any kind.
- **Impersonating real individuals** (living or deceased) without explicit disclosure that the content is AI-generated.
- Generating **misleading claims in sensitive domains**: health diagnoses, legal advice, financial guidance, or government services.
- Claiming that **AI-generated content was created by a human** in order to deceive users about its origin.

#### 9.1.5 Data Retention Awareness
Google may retain prompts, system instructions, and model outputs for **up to 55 days** for safety and abuse monitoring. Do not send personally identifiable information (PII), passwords, API keys, or confidential business data as part of Gemini prompts.

#### 9.1.6 Enforcement Consequences (Gemini)
Violations may result in:
- Temporary API rate limits or usage caps.
- Temporary suspension of the API key.
- Permanent revocation of Gemini API access and termination of all associated Google services.

---

### 9.2 — Google Custom Search API (Programmable Search Engine)

**Source:** [Custom Search API Overview](https://developers.google.com/custom-search/v1/overview) · [Google APIs ToS](https://developers.google.com/terms)

This project uses `GOOGLE_SEARCH_API_KEY` for the Intel Radar feature. The following rules govern its use:

#### 9.2.1 Active Policy Changes (CRITICAL — Action Required by 2027)

| Change | Effective Date | Impact |
|---|---|---|
| New PSE engines can no longer search the **entire web** | Early 2026 (already in effect) | Intel Radar must target specific domains only |
| Standard Custom Search API limited to **max 50 domains** | January 1, 2027 | Domain list in radar configuration must stay ≤ 50 |
| "Custom Search Site Restricted JSON API" **discontinued** | January 8, 2025 (already past) | Do not reference or attempt to use this deprecated endpoint |
| Google actively migrating users to **Vertex AI Search** | Ongoing | Evaluate migration path before 2027 deadline |

> **Action Item:** Before December 31, 2026, evaluate migrating Intel Radar's search backend to Vertex AI Search to avoid service disruption.

#### 9.2.2 Usage Prohibitions
- **Quota bypass:** Never attempt to circumvent the **10,000 queries/day** free-tier cap by rotating API keys across multiple Google Cloud projects to simulate a single client. This is a direct ToS violation that triggers project suspension.
- **Fee avoidance:** Accessing the API in a way intended to avoid billing charges is prohibited.
- **Deceptive practices:** Do not misrepresent to users what data the search API is accessing or collecting.
- **Unauthorized access patterns:** Do not use undocumented API methods, reverse-engineer the service, or test for vulnerabilities not explicitly permitted.
- **Cross-service violations:** Do not use the Search API as a vector to access other Google products in a manner that violates those products' own ToS.

#### 9.2.3 Transparency & Privacy Requirements
- Users must be informed about what search data is collected, stored, and shared.
- A publicly accessible privacy policy disclosing search data handling is required.

---

### 9.3 — Gmail API & Google OAuth 2.0 (Restricted Scopes)

**Source:** [Gmail API Scopes](https://developers.google.com/gmail/api/auth/scopes) · [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

This project uses Gmail OAuth for the Outreach module's mailbox connectivity. Gmail scopes (`gmail.readonly`, `gmail.modify`, `gmail.compose`) are classified as **Restricted Scopes** — the highest sensitivity tier.

#### 9.3.1 Prohibited Uses of Gmail Data
- **Advertising or marketing targeting:** It is **strictly forbidden** to use Gmail or mailbox data for any advertising, marketing, ad targeting, or behavioral profiling purposes. This is an absolute prohibition.
- **Unrelated data scanning:** Scanning email content for purposes unrelated to the user-facing Outreach feature (e.g., aggregating data for third-party analytics, training ML models without explicit user consent) is prohibited.
- **Data transfer without consent:** Gmail data must not be transferred to any third-party service (including analytics platforms) without explicit, informed user consent.
- **Scope over-requesting:** The application must request only the **minimum necessary OAuth scopes**. If a less-sensitive scope achieves the same result, the restricted scope must not be used.

#### 9.3.2 Compliance Requirements (Ongoing)
- **OAuth Verification:** The Google Cloud project must maintain an approved OAuth verification status. If the app's use case changes, re-verification is required.
- **Privacy Policy:** A public-facing privacy policy explicitly disclosing how Gmail data is accessed, stored, and used must be maintained and linked in the OAuth consent screen.
- **CASA Security Assessment:** Applications handling restricted scope data that is transmitted to or stored on external servers (e.g., Railway backend) are subject to an **annual Cloud Application Security Assessment (CASA)** by a Google-designated third-party assessor. Failure to complete this assessment can result in token revocation.
- **Prominent Feature Requirement:** Restricted scope data must only be used for features that are prominent and directly visible to the user — not background processing invisible to the user.

#### 9.3.3 Token & Credential Hygiene
- OAuth refresh tokens must be stored encrypted at rest (`OUTREACH_TOKEN_ENCRYPTION_KEY`).
- Tokens must never be logged, printed to console, or exposed in API responses.
- Revoked or expired tokens must be deleted from the database immediately upon detection.

---

### 9.4 — Firebase (Auth, Firestore, Hosting)

**Source:** [Firebase Terms of Service](https://firebase.google.com/terms) · [Google Cloud AUP](https://cloud.google.com/terms/aup)

Firebase underpins all authentication and the frontend hosting. The following restrictions apply:

#### 9.4.1 Authentication Abuse Prevention
- **Account sharing:** Do not allow or architect a system where multiple users share a single Firebase Auth account. Each account must represent one human individual.
- **Account reselling:** Firebase Auth accounts must not be resold, packaged, or offered as part of a commercial product to third parties.
- **Credential stuffing:** Never use Firebase Auth in a way that programmatically generates bulk accounts for automation, testing at scale, or spam purposes.
- **Bypass of auth:** Never implement application logic that routes around Firebase token verification for convenience or performance.

#### 9.4.2 Firestore Data Restrictions
- Do not store **CSAE content, malware, or illegal material** in Firestore documents or Storage.
- Do not use Firestore as a relay for **phishing or spam campaigns**.
- Never write **unvalidated user input** directly to Firestore. All data must pass schema validation before persistence.

#### 9.4.3 Firebase Hosting
- Do not host content that violates Google's AUP (see Section 9.5) on Firebase Hosting.
- Do not use Firebase Hosting to **serve malware, phishing pages, or deceptive content**.

---

### 9.5 — Google Cloud Acceptable Use Policy (AUP)

**Source:** [Google Cloud AUP](https://cloud.google.com/terms/aup)

All Railway infrastructure runs on Google Cloud. The AUP applies to the entire backend.

#### 9.5.1 Absolute Prohibitions
- **Illegal activity:** Do not use any Google Cloud resource to facilitate child exploitation, terrorism, or any activity that violates applicable law.
- **Malware distribution:** Never use the server to generate, store, or distribute viruses, worms, Trojan horses, ransomware, or other malicious code.
- **Phishing & fraud:** Never use the backend to send phishing emails, operate scam pages, or facilitate pyramid schemes.
- **Unauthorized access:** Never use Google Cloud resources to attempt unauthorized access to other systems, networks, or user accounts.
- **Infrastructure interference:** Never interfere with, disrupt, or degrade Google's or any third party's infrastructure, services, or networks.
- **Reverse engineering:** Do not test for vulnerabilities in Google Cloud infrastructure or attempt to reverse-engineer its filtering and quota systems (unless covered by an explicit written agreement).
- **Spam:** Never use the backend to generate or distribute unsolicited bulk email (spam). The Outreach module must only send emails to contacts who have given explicit opt-in consent.

#### 9.5.2 Resource-Intensive Operations
- **Cryptocurrency mining:** Google requires **prior written approval** before any cryptocurrency mining activity on its infrastructure. This is prohibited without that approval.
- **Quota circumvention:** Spinning up additional Google Cloud projects to act as a single client and bypass quota limits is a direct AUP violation that results in project suspension.

#### 9.5.3 Cross-Service Violations
- Never use one Google API as a vector to access another Google product in a manner that violates that product's own terms (e.g., using the Custom Search API to scrape Gmail data).

---

### 9.6 — General Google API Enforcement & Suspension Protocol

**Source:** [Google APIs ToS](https://developers.google.com/terms) · [Google Cloud Terms](https://cloud.google.com/terms/)

#### 9.6.1 Suspension Triggers to Avoid
- **Quota bypass via project multiplication:** Creating multiple GCP projects to sidestep per-project rate limits is the single most common cause of project suspension.
- **Ignoring warning emails:** Google sends compliance warnings to the project owner's email. Failing to act on these within the specified window results in automatic suspension. Monitor `google-cloud-compliance@google.com` carefully.
- **Policy non-compliance:** Using any API in a way explicitly prohibited by its terms, even if technically possible.
- **Security failures:** Leaving API keys exposed (public GitHub repos, client-side bundles, log files) triggers automated abuse detection.

#### 9.6.2 Enforcement Consequences
| Severity | Google Action |
|---|---|
| First violation / minor | Warning email; temporary rate-limit applied |
| Unaddressed / repeated | Specific API access suspended |
| Serious / egregious | All GCP project APIs suspended |
| Flagrant / high-risk | Developer agreement terminated; account permanently banned; associated accounts chain-terminated |

#### 9.6.3 Data Deletion Warning
If a Google Cloud project or API key remains suspended for an extended period (typically several months), Google may **permanently delete all associated data**. There is no guarantee of reinstatement after appeal.

#### 9.6.4 Appeals Process
If a suspension is believed to be in error:
1. Do not create a new GCP project or API key to work around the suspension — this escalates enforcement.
2. File an appeal through the Google Cloud Console or the relevant developer console.
3. Provide clear, specific evidence of compliance and a remediation plan.
4. Appeals decisions are often final.

---

## Revision History

| Version | Date       | Author              | Summary                                                        |
|---------|------------|---------------------|----------------------------------------------------------------|
| 1.0.0   | 2026-05-01 | Principal DevSecOps | Initial protocol established                                   |
| 1.1.0   | 2026-05-01 | Principal DevSecOps | Added Section 9: Google Platform Policy Compliance + Directive 5 |
