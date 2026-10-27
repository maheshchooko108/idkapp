import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { screenForCrisis } from '@shared/crisis.ts';
import { saveCheckin } from '@/lib/api';
import { MIN_TOUCH, radius, space, type, useColors } from '@/lib/theme';

import { Button, Callout, Chip, Footnote, Headline, Row, ScaleRow } from './ui';

export const MOODS = ['Heavy', 'Low', 'Okay', 'Good', 'Bright'];
export const ENERGY = ['Drained', 'Tired', 'Steady', 'Awake', 'Charged'];
export const FEELINGS = [
  'calm', 'restless', 'anxious', 'hopeful', 'grateful', 'tired', 'scattered', 'focused',
  'lonely', 'connected', 'overwhelmed', 'tender', 'irritable', 'inspired', 'stuck', 'light',
];

type Props = {
  /** Light mode hides the note until asked for; deep mode opens it. */
  mode: 'light' | 'deep';
  compact?: boolean; // onboarding: mood + energy only
  submitLabel?: string;
  onSaved: () => void;
};

export function CheckinForm({ mode, compact, submitLabel = 'Save check-in', onSaved }: Props) {
  const c = useColors();
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [feelings, setFeelings] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(mode === 'deep');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (f: string) => setFeelings((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  return (
    <View style={{ gap: space.xl }}>
      <ScaleRow label="How are you arriving?" options={MOODS} value={mood} onChange={setMood} />
      <ScaleRow label="Energy" options={ENERGY} value={energy} onChange={setEnergy} />

      {!compact && (
        <View style={{ gap: space.sm }}>
          <Headline>Name what's here (optional)</Headline>
          <Row>
            {FEELINGS.map((f) => (
              <Chip key={f} label={f} selected={feelings.includes(f)} onPress={() => toggle(f)} />
            ))}
          </Row>
        </View>
      )}

      {!compact && (showNote ? (
        <View style={{ gap: space.sm }}>
          <Headline>In your own words</Headline>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={2000}
            placeholder="What's on your mind today?"
            placeholderTextColor={c.textMuted}
            accessibilityLabel="In your own words"
            style={{ ...type.body, color: c.text, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.lg, minHeight: MIN_TOUCH * 2.5, textAlignVertical: 'top' }}
          />
          <Footnote muted>Your words help your card speak to you. They're private to you.</Footnote>
        </View>
      ) : (
        <Button variant="link" label="Add a few words" onPress={() => setShowNote(true)} />
      ))}

      {error && <Callout style={{ color: c.danger }}>{error}</Callout>}
      <Button
        label={submitLabel}
        disabled={mood == null || energy == null}
        loading={saving}
        onPress={async () => {
          if (mood == null || energy == null) return;
          const crisis = screenForCrisis(note, feelings.join(' ')).flagged;
          setSaving(true);
          setError(null);
          try {
            await saveCheckin({ mood, energy, feelings, note: note.trim() || null, crisis });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            if (crisis) router.push('/crisis');
            else onSaved();
          } catch {
            setError("Couldn't save just now. Try again in a moment.");
          } finally {
            setSaving(false);
          }
        }}
      />
    </View>
  );
}
