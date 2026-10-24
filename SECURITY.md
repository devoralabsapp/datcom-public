# Security policy

## Reporting a vulnerability

Use **GitHub private vulnerability reporting** on the [public repository's Security page](https://github.com/devoralabsapp/lunch-together/security/advisories/new). Include affected code, reproduction steps with fictitious data, and expected impact. Never publish tokens, banking notifications, real orders, or password-reset links in a public issue.

Maintenance is best-effort; there is no guaranteed response time or paid bug bounty. Security fixes target the current `main` branch. Older deployments should update after reviewing changes and Firestore Rules.

## Deployment security model

- Order information is readable by all visitors by design. Confidential team information requires a different access model and tests.
- Firebase Web configuration is client-visible. Authorization relies on Firebase Authentication and Firestore Security Rules, not secrecy of a browser API key.
- Profiles/emails, administrator roles, order ownership, pricing, and payment transitions have separate Rules constraints.
- Guest identity persists in the browser. Clearing storage creates a new identity; booking blocks are not a strong ban against creating another guest session.
- Administrators and devices holding the bank notification secret are trusted. Forwarded notifications are not independently authenticated by a bank.
- Integration refresh tokens, webhook secrets, and Telegram bot tokens are server-only. Never use a `NEXT_PUBLIC_` prefix.
- Telegram logging is optional and best-effort. Accounts and balances are redacted, but descriptions may still contain personal text. Restrict channel membership.

The source is a deployment template, not a security certification. Review configuration and Rules for your project before operating it.
