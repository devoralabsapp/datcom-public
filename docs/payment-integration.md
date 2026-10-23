# Optional payment notifications and Telegram logs

Manual payment confirmation works without this integration. Automatic matching uses **text forwarded from an administrator's banking app**, not a signed webhook from a bank.

## Receiving account and QR

In the payment dialog, an administrator sets the receiving bank, full account number, and name. Users create a QR for one unpaid order; administrators can create one for another person's order. QR codes are generated locally with the exact amount and a reference such as `COM0123456789ABCDEF0123`.

Preserve that amount and reference when transferring. Names alone cannot identify a payment. Changing an order or receiving account invalidates old matching information. Check the recipient shown by the banking app before transferring; the website does not independently verify account ownership.

## Configure the receiver

1. Publish the latest complete `firestore.rules` for your project.
2. As primary administrator, open **Connect payment Shortcut → Create API integration** in the payment dialog.
3. Store the generated `PAYMENT_WEBHOOK_SECRET` and `PAYMENT_FIREBASE_REFRESH_TOKEN` in the server's **Production** environment and redeploy. Never prefix them `NEXT_PUBLIC_` or commit their values.
4. Send notification text from the trusted device automation. Only the webhook secret goes on the device; the refresh token stays on the server.

The dedicated Firebase identity has restricted payment permissions through Rules. Never give it an `admins` document. The primary administrator can list and disconnect integrations in the same dialog. Notification access depends on the automation tool/OS and is not provided by this repository.

## Request contract

```http
POST /api/payments/bank-notification
Authorization: Bearer <PAYMENT_WEBHOOK_SECRET>
Content-Type: application/json
```

```json
{
  "notification": "+ VND 40,000\nAccount: 00012345678901\nBalance: VND 90,000\nCOM0123456789ABCDEF0123"
}
```

This is fictitious Techcombank-shaped text, not a usable payment or live reference. JSON must have only the string field `notification`. Raw `text/plain` is also accepted. Limits: body 16 KB; notification 12,000 characters. Do not send images, OTPs, passwords, or just a balance.

BIDV needs a positive VND amount, full receiving account, transaction timestamp/code, and a unique order reference in the text. Techcombank supports tested `Account / Amount / Balance` and `+ VND … / Account / Balance` layouts. Its short format lacks transaction time/ID, so replay handling uses a fingerprint and API receipt time. Up to eight identical repeated blocks are collapsed; conflicting blocks are rejected. New banks/layouts need explicit parser support and tests.

Matching checks the reference, exact amount, receiving bank/account, QR validity, and current order snapshot. Settlement and immutable receipt are atomic. Duplicate requests cannot settle another order. Missing references, ambiguous fields, stale QR codes, and amount/account mismatches do not mark paid. [Detailed Vietnamese API reference](bank-payments.md).

## Telegram

Add a bot to a private channel as administrator with posting permission. Set these **server-only Production** variables and redeploy:

```text
PAYMENT_TELEGRAM_BOT_TOKEN=<your-bot-token>
PAYMENT_TELEGRAM_CHAT_ID=<your-private-channel-id>
```

Logs redact account numbers and balances and show identical Techcombank blocks once. Original request length/fingerprint remains for diagnosis. Logging is best-effort and never determines payment success. Transfer descriptions may contain personal text; restrict channel access. [Vietnamese setup details](telegram-payment-logs.md).

## Trust and recovery

Anyone holding the webhook secret can submit fabricated text. Use trusted devices and rotate exposed secrets. This is convenient reconciliation, not independent proof from the bank. Reconcile unmatched notifications against bank records and confirm manually; never weaken matching to accept only a name or amount.

To replace an integration, create a new one, update both server secrets, redeploy, then disconnect the old one. Recreate an integration if its account is deleted or refresh token revoked. Consider this account's lifecycle before enabling automatic deletion of anonymous accounts.

## Multiple dishes, partial balances and refunds

See [orders, payment differences and restaurant sharing](orders-payments-sharing.md) for grouped QRs, resumable settlement, preserved paid amounts, administrator-confirmed refunds and expiring restaurant links. QR amounts now represent the remaining balance, which can be lower than the meal total. Publish the full updated Rules before deploying.
