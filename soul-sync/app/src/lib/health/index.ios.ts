// Apple HealthKit. HRV here is SDNN (Apple's only HRV type).
import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import { dailyAverage, sleepMinutesByWakeDate, toHealthRows } from '@shared/health.ts';
import { localDate } from '@shared/dates.ts';

import type { HealthProvider } from './index';

const READ = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierStepCount',
] as const;

const ASLEEP = new Set<number>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
]);

export const health: HealthProvider = {
  name: 'Apple Health',
  isAvailable: () => isHealthDataAvailableAsync(),
  async requestAccess() {
    // HealthKit never reveals whether *read* access was granted (privacy by design);
    // resolving true means the sheet was shown. Empty reads mean "denied or no data".
    return requestAuthorization({ toRead: READ });
  },
  async readDaily(days, timeZone) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 86_400_000);
    const filter = { date: { startDate, endDate } };

    const [sleepSamples, hrvSamples, rhrSamples, stepStats] = await Promise.all([
      queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: -1, filter }),
      queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { limit: -1, filter, unit: 'ms' }),
      queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', { limit: -1, filter, unit: 'count/min' }),
      // Statistics de-duplicate iPhone + Watch steps; raw samples would double count.
      queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], startDate, { day: 1 }, { filter, unit: 'count' }),
    ]);

    const sleep = sleepMinutesByWakeDate(
      sleepSamples.filter((s) => ASLEEP.has(Number(s.value))).map((s) => ({ start: s.startDate, end: s.endDate })),
      timeZone,
    );
    const hrv = dailyAverage(hrvSamples.map((s) => ({ at: s.startDate, value: s.quantity })), timeZone);
    const restingHr = dailyAverage(rhrSamples.map((s) => ({ at: s.startDate, value: s.quantity })), timeZone);
    const steps = new Map<string, number>();
    for (const b of stepStats) {
      if (b.startDate && b.sumQuantity) steps.set(localDate(b.startDate, timeZone), b.sumQuantity.quantity);
    }
    return toHealthRows({ sleep, hrv, hrvMethod: 'sdnn', restingHr, steps, source: 'healthkit' });
  },
};
