import { create } from 'zustand';
import { APP_SETTING_KEYS } from 'shared';

type HintState = 'pending' | 'seen' | 'dismissed';

const KEY_COMPLETED = APP_SETTING_KEYS.onboardingCompleted;
const KEY_HINT_SEARCH = APP_SETTING_KEYS.onboardingHintSearch;
const KEY_HINT_WEB = APP_SETTING_KEYS.onboardingHintWeb;

interface OnboardingStore {
  loaded: boolean;
  completed: boolean;
  hints: { search: HintState; web: HintState };
  load: () => Promise<void>;
  setCompleted: () => Promise<void>;
  markHint: (hint: 'search' | 'web', state: HintState) => Promise<void>;
}

function parseHint(value: string | null): HintState {
  return value === 'seen' || value === 'dismissed' ? value : 'pending';
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  loaded: false,
  completed: false,
  hints: { search: 'pending', web: 'pending' },

  load: async () => {
    const [completed, search, web] = await Promise.all([
      window.sortieAPI.settings.get(KEY_COMPLETED),
      window.sortieAPI.settings.get(KEY_HINT_SEARCH),
      window.sortieAPI.settings.get(KEY_HINT_WEB),
    ]);
    set({
      loaded: true,
      completed: completed === 'true',
      hints: { search: parseHint(search), web: parseHint(web) },
    });
  },

  setCompleted: async () => {
    if (get().completed) return;
    set({ completed: true });
    await window.sortieAPI.settings.set(KEY_COMPLETED, 'true');
  },

  markHint: async (hint, state) => {
    if (get().hints[hint] === state) return;
    set((s) => ({ hints: { ...s.hints, [hint]: state } }));
    await window.sortieAPI.settings.set(
      hint === 'search' ? KEY_HINT_SEARCH : KEY_HINT_WEB,
      state,
    );
  },
}));
