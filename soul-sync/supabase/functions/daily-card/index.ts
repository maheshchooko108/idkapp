// POST /daily-card  { force?: boolean, onboarding?: boolean }
// Returns today's card for the signed-in user, generating it when needed.
import { adminClient, callerId, corsHeaders, json } from '../_shared/clients.ts';
import { getOrCreateCard } from '../_shared/engine.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const userId = await callerId(req);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  try {
    const card = await getOrCreateCard(adminClient(), userId, {
      force: Boolean(body.force),
      kind: body.onboarding ? 'onboarding' : 'normal',
    });
    return json({ card });
  } catch (e) {
    console.error(e);
    return json({ error: 'could not load your card' }, 500);
  }
});
