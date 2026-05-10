import { create } from 'zustand';
import zh from './zh';
import en from './en';

export type Locale = 'zh' | 'en';

export type TranslationDict = Record<string, string>;

const dictionaries: Record<Locale, TranslationDict> = { zh, en };

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem('ai-collab-locale');
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {}
  return 'zh';
}

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: getInitialLocale(),
  setLocale: (locale: Locale) => {
    try {
      localStorage.setItem('ai-collab-locale', locale);
    } catch {}
    set({ locale });
  },
  t: (key: string, params?: Record<string, string | number>) => {
    const { locale } = get();
    let value = dictionaries[locale][key] ?? dictionaries['zh'][key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
        value = value.replace(`\${${k}}`, String(v));
      }
    }
    return value;
  },
}));

export function t(key: string, params?: Record<string, string | number>): string {
  return useI18n.getState().t(key, params);
}
