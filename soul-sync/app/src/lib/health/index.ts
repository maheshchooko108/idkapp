// Platform-neutral surface for body data. Metro picks index.ios.ts or
// index.android.ts at build time; this file is the fallback (web, simulators
// without health support) and the shared contract.
import type { HealthRow } from '@shared/health.ts';

export type HealthProvider = {
  /** e.g. "Apple Health" or "Health Connect"; null if unavailable on this device. */
  name: string | null;
  isAvailable(): Promise<boolean>;
  /** Shows the OS permission sheet. Call only from a user tap, in context. */
  requestAccess(): Promise<boolean>;
  /** Daily rows for the last `days` local days. */
  readDaily(days: number, timeZone: string): Promise<HealthRow[]>;
};

export const health: HealthProvider = {
  name: null,
  isAvailable: async () => false,
  requestAccess: async () => false,
  readDaily: async () => [],
};
