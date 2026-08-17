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

// The static "we got your email" acknowledgement. Unlike auto-send this
// defaults ON, because the reply is a fixed sentence that cannot say anything
// wrong; only an explicit 'off' disables it.
const AUTO_ACK_KEY = 'auto_ack';

export async function getAutoAck(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', AUTO_ACK_KEY)
    .maybeSingle();
  if (error) return true; // table/row may not exist yet — default ON
  return data?.value !== 'off';
}

export async function setAutoAck(supabase: SupabaseClient, on: boolean): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert(
    { key: AUTO_ACK_KEY, value: on ? 'on' : 'off', updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message);
}
