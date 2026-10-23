import english from './locales/en.json';

export type Locale = 'vi' | 'en';
export const LOCALE_COOKIE = 'com-nha-locale-v1';
export const defaultLocale: Locale = 'vi';
export const parseLocale = (value: unknown): Locale => value === 'en' ? 'en' : defaultLocale;
export const intlLanguage = (locale: Locale) => locale === 'en' ? 'en-GB' : 'vi-VN';
const dictionary: Record<string, string> = english;
const prefixes = Object.keys(dictionary).filter(key => key.length > 14).sort((a, b) => b.length - a.length);
const timeZone = 'Asia/Ho_Chi_Minh';

export function translate(locale: Locale, text: string, values: Record<string, unknown> = {}) {
  let result = text;
  if (locale === 'en') {
    const key = text.replace(/\s+/g, ' ').trim();
    const translated = Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
    if (translated !== undefined) {
      result = (text.match(/^\s*/)?.[0] || '') + translated + (text.match(/\s*$/)?.[0] || '');
    } else {
      // Legacy notices append names/details to a source phrase. Prefer placeholders in new copy.
      const prefix = prefixes.find(key => text.startsWith(key) && /^[\s:.?]/.test(text.slice(key.length)));
      if (prefix) result = dictionary[prefix] + text.slice(prefix.length);
    }
  }
  return result.replace(/\{(\d+|\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}

export const formatMoney = (locale: Locale, amount: number) => new Intl.NumberFormat(intlLanguage(locale)).format(amount) + ' ₫';

export function formatLongDate(locale: Locale, date: string) {
  return new Intl.DateTimeFormat(intlLanguage(locale), {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone,
  }).format(new Date(date + 'T12:00:00+07:00'));
}

export function formatTimestamp(locale: Locale, date: string) {
  return new Intl.DateTimeFormat(intlLanguage(locale), {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(date));
}

export function formatCompact(locale: Locale, n: number) {
  if (n >= 1_000_000) return new Intl.NumberFormat(intlLanguage(locale), {maximumFractionDigits: 1}).format(n / 1_000_000) + (locale === 'vi' ? 'tr' : 'm');
  if (n >= 1_000) return new Intl.NumberFormat(intlLanguage(locale), {maximumFractionDigits: 0}).format(n / 1_000) + 'k';
  return String(n);
}
