import { View } from 'react-native';

import { radius, space, useColors } from '@/lib/theme';

import { Footnote } from './ui';

export type BarPoint = { label: string; value: number | null };

/**
 * Minimal bar chart in plain Views: no chart library, works with Dynamic Type,
 * and each bar is announced to screen readers with its value.
 */
export function Bars({ title, points, max, format, color }: { title: string; points: BarPoint[]; max?: number; format: (v: number) => string; color?: string }) {
  const c = useColors();
  const top = max ?? Math.max(1, ...points.map((p) => p.value ?? 0));
  return (
    <View style={{ gap: space.sm }} accessibilityLabel={title}>
      <Footnote muted>{title.toUpperCase()}</Footnote>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, height: 96 }}>
        {points.map((p) => (
          <View key={p.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} accessible accessibilityLabel={`${p.label}: ${p.value == null ? 'no data' : format(p.value)}`}>
            <View
              style={{
                width: '70%',
                height: p.value == null ? 2 : `${Math.max(4, (p.value / top) * 100)}%`,
                backgroundColor: p.value == null ? c.border : color ?? c.accent,
                borderRadius: radius.md / 2,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        {points.map((p) => (
          <Footnote key={p.label} muted center style={{ flex: 1 }}>
            {p.label}
          </Footnote>
        ))}
      </View>
    </View>
  );
}
