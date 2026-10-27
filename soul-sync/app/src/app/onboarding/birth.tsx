import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';

import { DateTimeField, toHhMm, toIsoDate } from '@/components/DateTimeField';
import { Body, Button, Callout, Footnote, Headline, Screen, Title } from '@/components/ui';
import { deviceTimeZone, searchPlaces, updateProfile, type Place } from '@/lib/api';
import { MIN_TOUCH, radius, space, type, useColors } from '@/lib/theme';

export default function Birth() {
  const c = useColors();
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date(1990, 0, 1));
  const [time, setTime] = useState(new Date(1990, 0, 1, 12, 0));
  const [timeKnown, setTimeKnown] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (place && query === `${place.name}, ${place.detail}`) return;
    const t = setTimeout(() => searchPlaces(query).then(setResults).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [query, place]);

  const input = { ...type.body, color: c.text, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: MIN_TOUCH };

  return (
    <Screen>
      <Title>Your timing</Title>
      <Body muted>Your Vedic chart comes from when and where you were born. We use it as a lens for reflection, never as a prediction.</Body>

      <View style={{ gap: space.sm }}>
        <Headline>First name (optional)</Headline>
        <TextInput value={name} onChangeText={setName} placeholder="What should we call you?" placeholderTextColor={c.textMuted} style={input} autoComplete="given-name" accessibilityLabel="First name" />
      </View>

      <DateTimeField label="Birth date" mode="date" value={date} onChange={setDate} maximumDate={new Date()} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TOUCH }}>
        <Headline>I know my birth time</Headline>
        <Switch value={timeKnown} onValueChange={setTimeKnown} accessibilityLabel="I know my birth time" />
      </View>
      {timeKnown ? (
        <DateTimeField label="Birth time" mode="time" value={time} onChange={setTime} />
      ) : (
        <Footnote muted>No problem. We'll use midday: your Moon and dasha stay meaningful, and we skip the rising sign.</Footnote>
      )}

      <View style={{ gap: space.sm }}>
        <Headline>Birthplace</Headline>
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setPlace(null);
          }}
          placeholder="City, e.g. Port of Spain"
          placeholderTextColor={c.textMuted}
          style={input}
          autoCorrect={false}
          accessibilityLabel="Birthplace"
        />
        {!place && results.map((r) => (
          <Pressable
            key={`${r.lat},${r.lon}`}
            accessibilityRole="button"
            accessibilityLabel={`${r.name}, ${r.detail}`}
            onPress={() => {
              setPlace(r);
              setQuery(`${r.name}, ${r.detail}`);
              setResults([]);
            }}
            style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.lg, backgroundColor: c.surface, borderRadius: radius.md }}
          >
            <Callout>{r.name}</Callout>
            <Footnote muted>{r.detail}</Footnote>
          </Pressable>
        ))}
      </View>

      {error && <Callout style={{ color: c.danger }}>{error}</Callout>}
      <Button
        label="Continue"
        disabled={!place}
        loading={saving}
        onPress={async () => {
          if (!place) return;
          setSaving(true);
          setError(null);
          try {
            await updateProfile({
              first_name: name.trim() || null,
              birth_date: toIsoDate(date),
              birth_time: timeKnown ? toHhMm(time) : null,
              birth_time_known: timeKnown,
              birth_place: `${place.name}, ${place.detail}`,
              birth_lat: place.lat,
              birth_lon: place.lon,
              birth_tz: place.timezone,
              timezone: deviceTimeZone(),
            });
            router.push('/onboarding/arrive');
          } catch (e) {
            setError('Could not save. Check your connection and try again.');
          } finally {
            setSaving(false);
          }
        }}
      />
      <Footnote muted center>Your birth data stays private to you. You can delete it any time.</Footnote>
    </Screen>
  );
}
