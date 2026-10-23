'use client';
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {Languages} from 'lucide-react';
import {
  formatCompact, formatLongDate, formatMoney, formatTimestamp, intlLanguage,
  LOCALE_COOKIE, parseLocale, translate, type Locale,
} from '../lib/i18n';

function localeTools(locale: Locale) {
  return {
    locale,
    intlLocale: intlLanguage(locale),
    t: (text: string, values?: Record<string, unknown>) => translate(locale, text, values),
    money: (amount: number) => formatMoney(locale, amount),
    longDate: (date: string) => formatLongDate(locale, date),
    timestamp: (date: string) => formatTimestamp(locale, date),
    compact: (n: number) => formatCompact(locale, n),
  };
}

type LanguageContext = ReturnType<typeof localeTools> & {setLocale: (locale: Locale) => void};
const Context = createContext<LanguageContext | null>(null);

export function I18nProvider({initialLocale = 'vi', children}: {initialLocale?: Locale; children: React.ReactNode}) {
  const [locale, setLanguage] = useState<Locale>(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    const value = parseLocale(next);
    setLanguage(value);
    try {
      document.cookie = `${LOCALE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    } catch {
      // Switching still works for this page session when cookies are blocked.
    }
  }, []);
  const value = useMemo(() => ({...localeTools(locale), setLocale}), [locale, setLocale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, 'Cơm Nhà · Đặt cơm văn phòng');
  }, [locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n() {
  const context = useContext(Context);
  if (!context) throw new Error('I18nProvider is required.');
  return context;
}

export function LocalizedText({text}: {text: string}) {
  return useI18n().t(text);
}

export function LanguageSwitcher() {
  const {locale, setLocale, t} = useI18n();
  return (
    <label className="language-switcher">
      <Languages size={16} aria-hidden="true"/>
      <span className="sr-only">{t('Chọn ngôn ngữ')}</span>
      <select aria-label={t('Chọn ngôn ngữ')} value={locale} onChange={e => setLocale(parseLocale(e.target.value))}>
        <option value="vi" lang="vi">VI · Tiếng Việt</option>
        <option value="en" lang="en">EN · English</option>
      </select>
    </label>
  );
}
