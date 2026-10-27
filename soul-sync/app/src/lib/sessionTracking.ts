// Measures foreground time so the dashboard can confirm the healthy target:
// sessions under two minutes. Durations only; nothing about content.
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { recordSession } from './api';

let startedAt: Date | null = null;

function onChange(state: AppStateStatus) {
  if (state === 'active') {
    startedAt ??= new Date();
  } else if (startedAt) {
    const seconds = (Date.now() - startedAt.getTime()) / 1000;
    const begun = startedAt;
    startedAt = null;
    if (seconds >= 2) recordSession(begun, seconds, Platform.OS).catch(() => {});
  }
}

export function startSessionTracking() {
  if (AppState.currentState === 'active') startedAt = new Date();
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
