// Crisis-language screen for check-in text.
//
// This is a deliberately over-inclusive keyword screen, not a classifier. A
// false positive shows someone a kind screen with support numbers; a false
// negative can cost far more. It runs on the device (instant, works offline)
// AND on the server before any card is generated, so a modified client cannot
// skip it. Negations ("I'm not suicidal") still trigger on purpose.

export type CrisisResult = { flagged: boolean; matched: string[] };

const PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'suicide', re: /\bsuicid(e|al)\b/i },
  { label: 'kill myself', re: /\bkill(ing)?\s+my\s?self\b/i },
  { label: 'kms', re: /\bkms\b/i },
  { label: 'unalive', re: /\bunalive\b/i },
  { label: 'end my life', re: /\bend(ing)?\s+(it\s+all|my\s+life|things)\b/i },
  { label: 'take my life', re: /\btake\s+my\s+(own\s+)?life\b/i },
  { label: 'want to die', re: /\b(want|wanna|going|ready)\s+(to\s+)?die\b/i },
  { label: 'better off dead', re: /\bbetter\s+off\s+(dead|without\s+me|if\s+i\s+(was|were)n'?t\s+here)\b/i },
  { label: 'no reason to live', re: /\bno\s+(reason|point)\s+(to|in)\s+(live|living|going\s+on)\b/i },
  { label: "don't want to be alive", re: /\bdon'?t\s+want\s+to\s+(be\s+alive|live|exist|wake\s+up)\b/i },
  { label: 'self-harm', re: /\bself[-\s]?harm(ing)?\b/i },
  { label: 'hurt myself', re: /\b(hurt|harm|cut|burn)(ing)?\s+my\s?self\b/i },
  { label: 'overdose', re: /\boverdos(e|ing)\b/i },
  // Spanish — common phrasings for a multilingual pilot group.
  { label: 'quiero morir', re: /\bquiero\s+morir(me)?\b/i },
  { label: 'matarme', re: /\bmatarme\b/i },
  { label: 'no quiero vivir', re: /\bno\s+quiero\s+(vivir|seguir)\b/i },
  { label: 'hacerme daño', re: /\bhacerme\s+da(ñ|n)o\b/i },
  { label: 'suicidarme', re: /\bsuicidarme\b/i },
];

export function screenForCrisis(...texts: (string | null | undefined)[]): CrisisResult {
  const text = texts.filter(Boolean).join(' \n ');
  const matched = PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
  return { flagged: matched.length > 0, matched };
}

export type CrisisResource = { label: string; detail: string; action?: string };

/** US-first, per the pilot. `action` is a tel:/sms:/https: URL. */
export const CRISIS_RESOURCES: CrisisResource[] = [
  { label: 'Call or text 988', detail: 'Suicide & Crisis Lifeline (US), 24/7, free and confidential.', action: 'tel:988' },
  { label: 'Text HOME to 741741', detail: 'Crisis Text Line (US), 24/7.', action: 'sms:741741&body=HOME' },
  { label: 'In immediate danger? Call 911', detail: 'Or go to the nearest emergency room.', action: 'tel:911' },
  { label: 'Outside the US', detail: 'Find a free local helpline at findahelpline.com.', action: 'https://findahelpline.com' },
];

export const CRISIS_MESSAGE =
  "It sounds like you're carrying something really heavy right now. You don't have to " +
  'hold it alone. Today, the one thing that matters is talking to a real person who can help.';
