import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { space } from '@/lib/theme';

import { Button, Headline } from './ui';

type Props = { label: string; mode: 'date' | 'time'; value: Date; onChange: (d: Date) => void; maximumDate?: Date };

/** iOS shows the picker inline; Android opens the system dialog from a button. */
export function DateTimeField({ label, mode, value, onChange, maximumDate }: Props) {
  const [open, setOpen] = useState(false);
  const shown = mode === 'date'
    ? value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const handle = (e: DateTimePickerEvent, d?: Date) => {
    setOpen(false);
    if (e.type === 'set' && d) onChange(d);
  };
  return (
    <View style={{ gap: space.sm }}>
      <Headline>{label}</Headline>
      {Platform.OS === 'ios' ? (
        <DateTimePicker value={value} mode={mode} display={mode === 'date' ? 'spinner' : 'compact'} onChange={handle} maximumDate={maximumDate} accessibilityLabel={label} />
      ) : (
        <>
          <Button variant="secondary" label={shown} hint={`Change ${label.toLowerCase()}`} onPress={() => setOpen(true)} />
          {open && <DateTimePicker value={value} mode={mode} onChange={handle} maximumDate={maximumDate} />}
        </>
      )}
    </View>
  );
}

export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const toHhMm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export function fromHhMm(s: string): Date {
  const [h, m] = s.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
