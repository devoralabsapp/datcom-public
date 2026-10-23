# Contributing to Cơm Nhà

Issues and pull requests in English or Vietnamese are welcome.

## Start here

1. Read the [README](README.md), [setup guide](docs/setup.md), and relevant feature documentation.
2. Fork the public repository and create a focused branch. Use your own Firebase project or local emulators, with sample data only.
3. Make a small, reviewable change. Explain the problem, resulting behavior, and verification.
4. Run `npm run build`, `npm run typecheck`, and `npm test` (Node.js 22 and Java 21).
5. Open a pull request. Include screenshots with fictitious data when a UI change benefits from visual review.

For substantial new features or data model changes, start with an issue. Small fixes and documentation improvements can go straight to a pull request.

## Product and security expectations

- Vietnamese remains the default; update English translations for new UI copy. See [localization](docs/localization.md).
- Preserve entered names, notes, dish names, payment references, and database identifiers when switching languages.
- Enforce ownership, money, role changes, and payment transitions in Firestore Rules. Hiding a button is not authorization.
- Add meaningful regression tests for changes affecting permissions, payments, or persistence. Never test against production.
- Never commit real orders, account numbers, workbook exports, private project settings, credentials, refresh tokens, or raw banking notifications. Redact screenshots and issues.
- Report vulnerabilities through [SECURITY.md](SECURITY.md), not public issues.

## Commit privacy

Use your GitHub-provided **noreply** address if you do not intend to publish your email. Check local commits and the final merge commit: GitHub squash merges can use a different author address. Maintainers using GitHub CLI should pass `gh pr merge --squash --author-email <their-noreply-address>` and verify the resulting metadata. Do not rewrite shared history without a separately agreed plan.

## Review and licensing

Maintainers review the final code and test results, including AI-assisted changes. Describe limitations honestly; do not include secrets or private prompts in a pull request. Your original contributions are licensed under this project's [MIT license](LICENSE). Third-party assets need compatible licensing and attribution.
