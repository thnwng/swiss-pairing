// Supabase Edge Function: @gamepairingbot webhook.
// Handles /newsession in groups (creates a tournament lobby bound to that chat
// and posts a join button) plus /start and /help in private chats.
// Security: the Telegram secret_token echo header is checked FAIL-CLOSED —
// missing config or missing/wrong header = reject. allowed_updates is
// restricted to ["message"] at setWebhook time. Ack fast, work best-effort.
// Identity: message.from is trusted because the secret proves the update came
// from Telegram. Secrets live in the service-role-only sp_config table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.0";

const makeClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
type SB = ReturnType<typeof makeClient>;

const APP_LINK = "https://t.me/gamepairingbot/matchups";

const randomCode = (n = 6) => {
  const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => alpha[b % alpha.length]).join("");
};

async function getConfig(sb: SB, key: string): Promise<string | null> {
  const { data } = await sb.from("sp_config").select("value").eq("key", key).maybeSingle();
  return (data as { value: string } | null)?.value ?? null;
}

async function send(token: string, chatId: number, text: string, joinCode?: string): Promise<void> {
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (joinCode) {
      body.reply_markup = {
        inline_keyboard: [[{ text: "Join the session", url: `${APP_LINK}?startapp=${joinCode}` }]],
      };
    }
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (_) {
    /* best-effort */
  }
}

const displayName = (u: { first_name?: string; last_name?: string; username?: string; id: number }): string => {
  const parts = [u.first_name, u.last_name].filter(Boolean).map(String);
  if (parts.length) return parts.join(" ").slice(0, 30);
  if (u.username) return ("@" + u.username).slice(0, 30);
  return "Player " + u.id;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok"); // health probes etc.
  const sb = makeClient();

  const secret = await getConfig(sb, "webhook_secret");
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !got || got !== secret) return new Response("forbidden", { status: 403 });

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const text: string = (msg?.text || "").trim();
  const chat = msg?.chat;
  const from = msg?.from;
  if (!text || !chat || !from || from.is_bot) return new Response("ok");

  const isGroup = chat.type === "group" || chat.type === "supergroup";
  const botToken = await getConfig(sb, "bot_token");
  if (!botToken) return new Response("ok");

  try {
    if (/^\/(newsession|new)(@gamepairingbot)?\b/i.test(text)) {
      if (!isGroup) {
        await send(botToken, chat.id,
          "Add me to your group and type /newsession there — everyone can then join the tournament from one button.");
        return new Response("ok");
      }
      const uname = displayName(from);
      const name = (text.replace(/^\/\w+(@\w+)?\s*/, "").trim() || chat.title || "Tournament").slice(0, 60);
      const code = randomCode();
      const { data: ins } = await sb.from("sp_sessions")
        .insert({ code, chat_id: chat.id, creator_id: from.id, creator_name: uname, name })
        .select("id").single();
      if (ins) {
        await sb.from("sp_players").insert({ session_id: ins.id, name: uname, tg_id: from.id, tg_name: uname });
        await send(botToken, chat.id,
          `${uname} opened a tournament lobby: "${name}".\nTap to join, claim a spot or add your nickname. Needs at least 3 players.`,
          code);
      }
    } else if (/^\/start\b/.test(text) && !isGroup) {
      await send(botToken, chat.id,
        "This bot runs tournament pairings (Swiss or round robin).\n\n" +
        "Solo: open the app from the menu button below.\n" +
        "Group: add me to a group and type /newsession — everyone joins from one link, you run the event, the group sees the results.");
    } else if (/^\/help(@gamepairingbot)?\b/i.test(text)) {
      await send(botToken, chat.id,
        "/newsession [name] — open a tournament lobby in this group\n" +
        "Join via the lobby button: claim an unclaimed name or add your own.\n" +
        "The organizer starts the event (3+ players, Swiss or round robin), enters results in the app, and standings stay live for everyone.");
    }
  } catch (e) {
    console.error("bot update failed", e);
  }
  return new Response("ok");
});
