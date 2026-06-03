import { STRINGS, type Lang, type StringKey } from './strings';

/** A bound translate function: `t('hi', { name })`. */
export type TFunction = (key: StringKey, vars?: Record<string, string | number>) => string;

/**
 * Build a translate function for a locale. Falls back to the key itself if a
 * string is missing, and interpolates `{var}` placeholders.
 */
export function makeT(lang: Lang): TFunction {
  const dict = STRINGS[lang] ?? STRINGS.zh;
  return (key, vars) => {
    let s: string = dict[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
}

/** Detect an initial locale from the browser, defaulting to Chinese. */
export function detectLang(): Lang {
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'zh';
}

export type { Lang, StringKey };
