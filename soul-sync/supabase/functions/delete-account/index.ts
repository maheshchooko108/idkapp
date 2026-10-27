// POST /delete-account  { confirm: "DELETE" }
// Permanently deletes the caller's auth user; every table cascades from it.
import { adminClient, callerId, corsHeaders, json } from '../_shared/clients.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const userId = await callerId(req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== 'DELETE') return json({ error: 'send {"confirm":"DELETE"}' }, 400);

  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
});
