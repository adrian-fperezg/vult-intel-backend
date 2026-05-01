# ROADMAP — vult-intel

This document tracks the long-term technical debt and stability roadmap for the Vult Intel platform.

## Technical Debt

### Migrate Intel Radar Search Engine [URGENCY: RED]
- **Due Date:** 2026-12-31
- **Summary:** Complete migration of the legacy radar search engine to the new optimized architecture to improve performance and reduce latency.
- **Full Context:** The current radar search engine is hitting scalability limits. We need to migrate all existing indices to the new backend and update the query parser to support advanced filtering logic.
- **Action:**
  1. Audit existing search indices.
  2. Implement new search service in `server/lib/radar/`.
  3. Update frontend to use the new API endpoints.
  4. Perform load testing and final cutover.

## Security Roadmap

### Implement Admin Dashboard Authentication [URGENCY: ORANGE]
- **Due Date:** 2026-06-30
- **Summary:** Secure the administrative portal with strict email-based access control.
- **Full Context:** The administrative dashboard provides access to sensitive system data. We must ensure only authorized personnel can access it.
- **Action:**
  1. Create `adminOnly` middleware.
  2. Implement whitelist check for `adrianfperezg@gmail.com`.
  3. Secure all `/api/admin/*` routes.

### Update Security Protocol Compliance [URGENCY: BLUE]
- **Due Date:** 2026-08-15
- **Summary:** Regularly audit and update the `SECURITY_PROTOCOL.md` to match the latest industry standards and platform updates.
- **Full Context:** As new features are added, security risks evolve. Continuous updates to the protocol are necessary to maintain platform integrity.
- **Action:**
  1. Monthly review of Google API policies.
  2. Update documentation with new risk mitigations.
