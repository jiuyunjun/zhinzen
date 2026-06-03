import { create } from 'zustand';
import { detectLang, makeT, type Lang, type TFunction } from '../i18n';

/**
 * uiState (design.md §14) — presentation-only preferences. Currently the
 * interface language; the bound `t` is recomputed whenever the language changes
 * so components can read it straight from the store.
 */
interface UiState {
  lang: Lang;
  t: TFunction;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
}

const initialLang = detectLang();

export const useUiStore = create<UiState>((set, get) => ({
  lang: initialLang,
  t: makeT(initialLang),
  setLang: (lang) => set({ lang, t: makeT(lang) }),
  toggleLang: () => {
    const next: Lang = get().lang === 'zh' ? 'en' : 'zh';
    set({ lang: next, t: makeT(next) });
  },
}));
