# Chakudya admin

Internal admin panel, one page per job. Not indexed (`noindex`), not part of the PWA shell.

| Page | What it does | API calls on load |
|---|---|---|
| `index.html` | Overview: health, items needing attention, registry record counts | `/admin/overview`, `/health` |
| `keys.html` | API key stats, 7-day usage trend, per-key table, create and revoke keys | `/admin/overview`, `/admin/keys` |
| `review.html` | Packaged food review queue (approve or reject) | `/admin/overview`, `/packaged/pending` |
| `usage.html` | Calls per endpoint (today, 7 or 30 days) | `/admin/usage` |
| `monitoring.html` | Failing and slow endpoints, latest failed and slow calls | `/admin/monitoring` |
| `activity.html` | Recent admin actions (keys created and revoked, foods reviewed) | `/admin/activity` |
| `ingest.html` | RAG ingest jobs (read-only) | `/admin/overview`, `/rag/jobs` |
| `audit.html` | FHIR audit log search | `/fhir/AuditEvent` |

## Shared files
- `admin.css` - all styles.
- `admin.js` - sign-in, session refresh, `Admin.call()` (gateway requests), helpers, header and page navigation, refresh and auto-refresh.

Sign-in uses the same session key as the docs site, so signing in on one page signs you in on all of them.

## Adding a page
1. Copy a small page such as `activity.html`: content goes in `<template id="tpl">`, logic in the inline script.
2. Call `Admin.mount({ id, title, init(), refresh(keep) })`.
   `init()` runs once (attach listeners), `refresh(keep)` runs on load, on Refresh and every 60 s when auto is on.
   `keep` is `true` on auto refresh, so lists the person is working through are not reset.
3. Add the page to `PAGES` in `admin.js` so it appears in the navigation.

Each page loads only its own data, so adding a page does not slow the others down.
