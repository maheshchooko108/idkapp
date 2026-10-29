import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Platform, View } from 'react-native';

import { MIN_TOUCH, radius, space, type, useColors } from '@/lib/theme';

import { Button, Headline } from './ui';

type Props = { label: string; mode: 'date' | 'time'; value: Date; onChange: (d: Date) => void; maximumDate?: Date };

/**
 * iOS shows the picker inline; Android opens the system dialog from a button.
 * The web preview uses the browser's own date/time input (the picker library
 * has no web build); on iPhone Safari that opens the native wheel.
 */
export function DateTimeField({ label, mode, value, onChange, maximumDate }: Props) {
  const [open, setOpen] = useState(false);
  const shown = mode === 'date'
    ? value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const handle = (e: DateTimePickerEvent, d?: Date) => {
    setOpen(false);
    if (e.type === 'set' && d) onChange(d);
  };
  const c = useColors();
  if (Platform.OS === 'web') {
    const iso = mode === 'date' ? toIsoDate(value) : toHhMm(value);
    return (
      <View style={{ gap: space.sm }}>
        <Headline>{label}</Headline>
        {createElement('input', {
          type: mode,
          value: iso,
          max: mode === 'date' && maximumDate ? toIsoDate(maximumDate) : undefined,
          'aria-label': label,
          onChange: (e: { target: { value: string } }) => {
            const v = e.target.value;
            if (!v) return;
            if (mode === 'date') {
              const [y, m, d] = v.split('-').map(Number);
              onChange(new Date(y, m - 1, d, value.getHours(), value.getMinutes()));
            } else {
              const [h, min] = v.split(':').map(Number);
              const next = new Date(value);
              next.setHours(h, min, 0, 0);
              onChange(next);
            }
          },
          style: {
            ...type.body, minHeight: MIN_TOUCH, padding: `0 ${space.lg}px`, borderRadius: radius.md,
            border: `1px solid ${c.border}`, background: c.surface, color: c.text, fontFamily: 'inherit',
          },
        })}
      </View>
    );
  }
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
