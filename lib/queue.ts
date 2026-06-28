import type { SupabaseClient } from "@supabase/supabase-js";

export async function queueSend(sb: SupabaseClient, msg: Record<string, unknown>): Promise<void> {
  const { error } = await sb.rpc("pgmq_send", { p_msg: msg });
  if (error) throw error;
}

export async function queueRead(
  sb: SupabaseClient,
  qty: number,
  vt: number,
): Promise<{ msgId: number; message: any }[]> {
  const { data, error } = await sb.rpc("pgmq_read", { p_qty: qty, p_vt: vt });
  if (error) throw error;
  return (data ?? []).map((r: { msg_id: number; message: any }) => ({
    msgId: r.msg_id,
    message: r.message,
  }));
}

export async function queueDelete(sb: SupabaseClient, msgId: number): Promise<void> {
  const { error } = await sb.rpc("pgmq_delete", { p_msg_id: msgId });
  if (error) throw error;
}
