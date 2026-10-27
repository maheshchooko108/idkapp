// Small set of primitives. Every tappable thing is ≥44pt, has an
// accessibility role/label, and text uses system fonts so it scales.
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { MIN_TOUCH, radius, space, type, useColors } from '@/lib/theme';

export function Screen({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const c = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: padded ? space.lg : 0, paddingBottom: space.xxl * 2, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

type TextProps = { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; center?: boolean };

function makeText(variant: keyof typeof type, role?: 'header') {
  return function T({ children, style, muted, center }: TextProps) {
    const c = useColors();
    return (
      <Text
        accessibilityRole={role}
        style={[type[variant], { color: muted ? c.textMuted : c.text, textAlign: center ? 'center' : undefined }, style]}
      >
        {children}
      </Text>
    );
  };
}

export const LargeTitle = makeText('largeTitle', 'header');
export const Title = makeText('title', 'header');
export const Headline = makeText('headline');
export const Body = makeText('body');
export const Callout = makeText('callout');
export const Footnote = makeText('footnote');

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'link';
  disabled?: boolean;
  loading?: boolean;
  hint?: string;
  haptic?: boolean;
};

export function Button({ label, onPress, variant = 'primary', disabled, loading, hint, haptic }: ButtonProps) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : variant === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? c.accentText : variant === 'secondary' ? c.text : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={async () => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        await onPress();
      }}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH,
        borderRadius: radius.pill,
        paddingHorizontal: space.xl,
        paddingVertical: space.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[type.headline, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{
        minHeight: MIN_TOUCH,
        justifyContent: 'center',
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: selected ? c.chipActive : c.chip,
      }}
    >
      <Text style={[type.callout, { color: selected ? c.accentText : c.text }]}>{label}</Text>
    </Pressable>
  );
}

/** One-of-N row (mood, energy). Behaves as a radio group for VoiceOver/TalkBack. */
export function ScaleRow({ label, options, value, onChange }: { label: string; options: string[]; value: number | null; onChange: (v: number) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Headline>{label}</Headline>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o, i) => {
          const selected = value === i + 1;
          return (
            <Pressable
              key={o}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${o}, ${i + 1} of ${options.length}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(i + 1);
              }}
              style={{
                minHeight: MIN_TOUCH,
                minWidth: MIN_TOUCH,
                paddingHorizontal: space.md,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: radius.md,
                backgroundColor: selected ? c.chipActive : c.chip,
                flexGrow: 1,
              }}
            >
              <Text style={[type.callout, { color: selected ? c.accentText : c.text }]}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Disclaimer() {
  return (
    <Footnote muted center>
      Wellness and self-reflection tool, not medical advice.
    </Footnote>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' }, style]}>{children}</View>;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md }} accessibilityLabel={label}>
      <ActivityIndicator color={c.accent} />
      <Callout muted>{label}</Callout>
    </View>
  );
}
