export type AppSettingKey =
  | 'onboarding.completed'
  | 'onboarding.hints.search'
  | 'onboarding.hints.web';

export type EmbedderStatus =
  | { state: 'idle' }
  | { state: 'warming' }
  | { state: 'ready' }
  | { state: 'error'; message: string };
