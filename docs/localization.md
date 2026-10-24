# Localization

The UI supports `vi` (Vietnamese) and `en` (English). **Vietnamese is always the default**, including for browsers whose preferred language is English. There is no browser-language detection or redirect.

The English application name is **Lunch Together**; the Vietnamese name remains **Cơm Nhà**. The language selector also changes the brand, workspace label, page title and restaurant export heading. Existing browser storage keys and payment references remain stable.

## User experience

The VI/EN control appears in the app header and on sign-in. Selecting a language updates labels without resetting the tab, order draft, filters, or QR. A first-party cookie, `com-nha-locale-v1`, remembers the choice for one year across app routes. It uses path `/`, `SameSite=Lax`, and `Secure` on HTTPS. When cookies are blocked, switching still works during the page session, but persistence is unavailable.

The server reads the same cookie for the initial UI, title, description, and `<html lang>`. Invalid or absent values default to Vietnamese. The browser updates document language/title on switching. Dates keep Vietnam time; money stays in Vietnamese đồng.

## Editing copy

- `lib/locales/en.json` maps Vietnamese source phrases to English.
- Use `const {t}=useI18n()` in client components; render `t('Vietnamese source phrase')` and add the dictionary entry.
- Prefer complete phrases with placeholders for dynamic values: `t('Tuần {0} – {1}', {'0':start, '1':end})`. Do not translate entered values.
- Hook helpers `money`, `longDate`, `timestamp`, and `compact` localize display without changing amounts or business dates.
- `LocalizedText` supports lazy loading fallbacks; server metadata uses `translate` directly.
- Keep stable IDs and raw values in Firestore, filters, payment references, and access checks. Never store translated labels as identifiers.

Unknown phrases fall back to the source. A longest-prefix fallback supports existing errors that append details to a known phrase; new dynamic copy should use placeholders. No external translation service is used. Server API responses and Telegram operational logs currently remain Vietnamese.

## Verification

Run the normal test suite. In a browser, check Vietnamese on a fresh session, switch to English, reload, visit sign-in, and return. Verify ordering, statistics, pickup draws, user administration, payment settings, errors, and narrow screens. Names, drafts, totals, QR references, and permissions must remain unchanged.
