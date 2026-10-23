# Setup and deployment

Use your own Firebase project and bank configuration. The public source contains empty environment placeholders and a menu example, not live orders or an administrator.

## 1. Runtime and Firebase

Use Node.js 22. Run `npm ci --include=dev --include=optional`, copy `.env.example` to `.env.local`, and enter Firebase Web configuration from **Project settings → Your apps**. `NEXT_PUBLIC_FIREBASE_*` is browser-visible; do not put privileged credentials there.

In Firebase Console:

1. Create **Cloud Firestore Standard**, database `(default)` unless intentionally configured otherwise.
2. Enable **Google** and **Anonymous** Authentication. Anonymous Authentication gives guests ownership without a login prompt.
3. Add `localhost` and the actual deployment hostname to authorized domains, without a protocol or port.

No Admin SDK, service-account key, Vercel OIDC, or server session secret is required.

## 2. Primary administrator and Rules

1. Run `npm run dev`, open [localhost:5173](http://localhost:5173), and sign in with the administrator's Google account. Data access may fail until Rules and membership are configured.
2. Copy that user's UID from Firebase Authentication → Users.
3. Replace **every** `PRIMARY_ADMIN_UID_HERE` in `lib/user-model.ts` and `firestore.rules` with that UID. Both files must match. A UID is an identifier, not a password; still avoid publishing production-specific configuration in a public fork.
4. In Firestore Data, create `admins/{UID}` with boolean `enabled: true` for initial membership.
5. Review and publish the **entire** `firestore.rules` file. It denies unlisted collections; do not replace Rules in a database shared with unrelated apps without reviewing their access needs.
6. Restart/rebuild after source changes, sign in again, and publish the first menu through **Edit menu**. Use VI/EN in the header to switch to English.

Enabled administrators require verified Google sign-in. The primary administrator can grant/revoke other administrators after their first Google sign-in. Other administrators manage menus, orders, payments, pickup draws, and regular users' booking access. Existing queries use automatic single-field indexes; no custom composite indexes are required.

## 3. Vercel

Import your fork using **Next.js**, **Node.js 22**, and the repository root. Install/build configuration is in `vercel.json`. Add the Firebase Web variables from `.env.example` to the appropriate environment; use `(default)` for the default database ID. Add the deployed hostname to Firebase authorized domains.

Redeploy when changing `NEXT_PUBLIC_*`: these values are embedded at build time. Use a separate Firebase project for untrusted previews; do not expose production orders or server secrets to pull-request environments.

Manual payment confirmation and local QR generation work after an administrator sets a receiving account. [Notification matching and Telegram logs](payment-integration.md) are optional server integrations.

## 4. Verify and operate

```sh
npm run build
npm run typecheck
npm test
```

Tests start local Auth/Firestore emulators under a `demo-` project and need Java 21. No live Firebase access is required. The runner chooses available loopback ports. Do not configure emulators in production; the client rejects emulator configuration outside a local demo environment.

Check guest ordering, owner editing, Google sign-in, admin menu changes, shared statistics, and VI/EN persistence before inviting the team. Do not send fake payment notifications to production orders.

Orders use `days/{dayId}/orders/{orderId}`. Shared team data and private profiles have different Rules. Old `mealDays`/`mealOrders` data is not automatically migrated. Google Sheets is an optional legacy statistics source, never the default; only configure it if its data is intended to be readable by app users.

The default cutoff is 09:30 Vietnam time; administrators can open/close a day manually. Pickup draws close the participant list before saving an immutable result.

For detailed Vietnamese operations, see [README.vi.md](../README.vi.md) and [deployment notes](deploy-vercel.md).

## Multiple dishes, partial balances and refunds

See [orders, payment differences and restaurant sharing](orders-payments-sharing.md) for grouped QRs, resumable settlement, preserved paid amounts, administrator-confirmed refunds and expiring restaurant links. QR amounts now represent the remaining balance, which can be lower than the meal total. Publish the full updated Rules before deploying.

Credit and activity history use the same Firebase project and Rules; see [credit and activity](credit-and-activity.md). Publish the full updated Rules before deploying. No extra composite index or privileged server credential is required.

The order list now groups payment under My orders and restricts manual reconciliation history to owners/administrators. See [order-list payment behavior](order-list-payments.md); publish the full updated Rules before release.
