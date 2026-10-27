// One notification a day, at the time the user picks. The server sends it
// with the card's own headline; the app only registers the device token.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { updateProfile } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false, // no badge spam
  }),
});

/** Ask for permission in context (from the "daily card" toggle) and store the push token. */
export async function enableDailyCard(notifyTime: string): Promise<boolean> {
  if (!Device.isDevice) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily-card', {
      name: 'Daily card',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!status.granted) return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await updateProfile({ push_token: token, notify_enabled: true, notify_time: notifyTime });
  return true;
}

export async function disableDailyCard() {
  await updateProfile({ notify_enabled: false });
}
