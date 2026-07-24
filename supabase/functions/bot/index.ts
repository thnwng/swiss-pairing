// Supabase Edge Function: @gamepairingbot webhook.
// Mirrors mahjong-web's bot exactly: the bot CREATES NOTHING — /start, /open
// (and being added to a group) reply with an "Open" button whose deep link
// carries g<chatId>, so the app opens that group's session home (list bound
// sessions or create a new one; creating announces the join button back into
// the chat). /help explains the flow.
// Security: the Telegram secret_token echo header is checked FAIL-CLOSED.
// Identity: message.from is trusted because the secret proves it's Telegram.
// Secrets live in the service-role-only sp_config table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.0";

const makeClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
type SB = ReturnType<typeof makeClient>;

const APP_LINK = "https://t.me/gamepairingbot/matchups";

async function getConfig(sb: SB, key: string): Promise<string | null> {
  const { data } = await sb.from("sp_config").select("value").eq("key", key).maybeSingle();
  return (data as { value: string } | null)?.value ?? null;
}

async function tg(token: string, method: string, payload: unknown): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (_) {
    /* best-effort */
  }
}

function openButton(param?: string) {
  const url = param ? `${APP_LINK}?startapp=${param}` : APP_LINK;
  return { inline_keyboard: [[{ text: "Open Pairings", url }]] };
}

async function replyOpen(token: string, chatId: number, isGroup: boolean): Promise<void> {
  // In a group the deep link carries g<chatId>, so the app opens this group's
  // session home — its tournaments, or create a new one. In private, no param.
  const param = isGroup ? `g${chatId}` : undefined;
  const text = isGroup
    ? "Tap below to open tournament pairings for this group — see its sessions, or create a new one."
    : "Tap below to open the pairing app.";
  await tg(token, "sendMessage", { chat_id: chatId, text, reply_markup: openButton(param) });
}

const HELP = [
  "Tournament pairing bot (Swiss system and round robin).",
  "",
  "In a group:",
  "- /start or /open — open this group's tournaments, or create one.",
  "  Creating a session posts a join button here: everyone claims their name",
  "  or joins with their own, the organizer starts at 3+ players, and",
  "  standings stay live for the whole group.",
  "",
  "In private chat:",
  "- /start — open the app (solo mode works fully offline).",
].join("\n");

async function handleUpdate(sb: SB, token: string, u: Record<string, unknown>): Promise<void> {
  // Bot added to a group -> greet with the open button (mahjong pattern).
  const mcm = u.my_chat_member as Record<string, unknown> | undefined;
  if (mcm) {
    const chat = mcm.chat as { id: number; type: string };
    const status = (mcm.new_chat_member as { status?: string })?.status;
    if ((chat.type === "group" || chat.type === "supergroup") && (status === "member" || status === "administrator")) {
      await replyOpen(token, chat.id, true);
    }
    return;
  }

  const msg = u.message as Record<string, unknown> | undefined;
  if (!msg) return;
  const chat = msg.chat as { id: number; type: string };
  const from = msg.from as { is_bot?: boolean } | undefined;
  const text = String(msg.text || "");
  if (!text.startsWith("/") || from?.is_bot) return;

  const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  const isGroup = chat.type === "group" || chat.type === "supergroup";

  if (cmd === "/start" || cmd === "/open" || cmd === "/pairings") {
    await replyOpen(token, chat.id, isGroup);
  } else if (cmd === "/help") {
    await tg(token, "sendMessage", { chat_id: chat.id, text: HELP });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok"); // health probes etc.
  const sb = makeClient();

  const secret = await getConfig(sb, "webhook_secret");
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !got || got !== secret) return new Response("forbidden", { status: 403 });

  const update = await req.json().catch(() => null);
  if (!update) return new Response("ok");
  const token = await getConfig(sb, "bot_token");
  if (!token) return new Response("ok");

  // Ack fast; do the work but swallow errors so Telegram never retries us.
  try {
    await handleUpdate(sb, token, update as Record<string, unknown>);
  } catch (e) {
    console.error("bot update failed", e);
  }
  return new Response("ok");
});
