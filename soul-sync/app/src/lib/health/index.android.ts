// Google Health Connect. HRV here is RMSSD, a different measure from Apple's
// SDNN; we store which, and only compare a user against their own baseline.
import {
  aggregateGroupByPeriod,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  SleepStageType,
  type Permission,
} from 'react-native-health-connect';

import { dailyAverage, sleepMinutesByWakeDate, toHealthRows, type Interval } from '@shared/health.ts';
import { localDate } from '@shared/dates.ts';

import type { HealthProvider } from './index';

const PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'Steps' },
];

const AWAKE_STAGES = new Set<number>([SleepStageType.AWAKE, SleepStageType.OUT_OF_BED, SleepStageType.UNKNOWN]);

let ready: Promise<boolean> | null = null;
function ensureInit() {
  ready ??= getSdkStatus()
    .then((s) => s === SdkAvailabilityStatus.SDK_AVAILABLE && initialize())
    .catch(() => false);
  return ready;
}

async function readAll<T extends 'SleepSession' | 'HeartRateVariabilityRmssd' | 'RestingHeartRate'>(
  type: T,
  startTime: string,
  endTime: string,
) {
  const out = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(type, { timeRangeFilter: { operator: 'between', startTime, endTime }, pageToken });
    out.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return out;
}

export const health: HealthProvider = {
  name: 'Health Connect',
  isAvailable: ensureInit,
  async requestAccess() {
    if (!(await ensureInit())) return false;
    const granted = await requestPermission(PERMISSIONS);
    return granted.length > 0;
  },
  async readDaily(days, timeZone) {
    if (!(await ensureInit())) return [];
    const granted = new Set((await getGrantedPermissions()).map((p) => p.recordType));
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - days * 86_400_000).toISOString();

    const [sessions, hrvRecords, rhrRecords, stepBuckets] = await Promise.all([
      granted.has('SleepSession') ? readAll('SleepSession', startTime, endTime) : [],
      granted.has('HeartRateVariabilityRmssd') ? readAll('HeartRateVariabilityRmssd', startTime, endTime) : [],
      granted.has('RestingHeartRate') ? readAll('RestingHeartRate', startTime, endTime) : [],
      granted.has('Steps')
        ? aggregateGroupByPeriod({
            recordType: 'Steps',
            timeRangeFilter: { operator: 'between', startTime, endTime },
            timeRangeSlicer: { period: 'DAYS', length: 1 },
          })
        : [],
    ]);

    // With stages, count only asleep stages; without, the whole session.
    const asleep: Interval[] = sessions.flatMap((s) =>
      s.stages?.length
        ? s.stages.filter((st) => !AWAKE_STAGES.has(st.stage)).map((st) => ({ start: new Date(st.startTime), end: new Date(st.endTime) }))
        : [{ start: new Date(s.startTime), end: new Date(s.endTime) }],
    );
    const sleep = sleepMinutesByWakeDate(asleep, timeZone);
    const hrv = dailyAverage(hrvRecords.map((r) => ({ at: new Date(r.time), value: r.heartRateVariabilityMillis })), timeZone);
    const restingHr = dailyAverage(rhrRecords.map((r) => ({ at: new Date(r.time), value: r.beatsPerMinute })), timeZone);
    const steps = new Map<string, number>();
    for (const b of stepBuckets) steps.set(localDate(new Date(b.startTime), timeZone), b.result.COUNT_TOTAL);

    return toHealthRows({ sleep, hrv, hrvMethod: 'rmssd', restingHr, steps, source: 'health_connect' });
  },
};
