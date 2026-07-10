import type { SupabaseClient } from '@supabase/supabase-js';

// Simple key/value app settings, stored in the app_settings table. Used for the
// Master View "Auto-send AI emails" toggle. Defaults to OFF (safe) whenever the
// row (or the table) does not exist.
const AUTO_SEND_KEY = 'auto_send';

export async function getAutoSend(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', AUTO_SEND_KEY)
    .maybeSingle();
  if (error) return false; // table/row may not exist yet — default OFF
  return data?.value === 'on';
}

export async function setAutoSend(supabase: SupabaseClient, on: boolean): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert(
    { key: AUTO_SEND_KEY, value: on ? 'on' : 'off', updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message);
}
