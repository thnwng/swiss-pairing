// Supabase Edge Function: multi-user tournament sessions for the swiss-pairing
// Mini App (@gamepairingbot). Client calls POST { op, initData, ...payload }.
// Telegram initData is validated (HMAC with the bot token) on every call; the
// service role touches the DB; no DB capability ever reaches the client.
// Secrets (bot token, webhook secret) live in the service-role-only sp_config
// table — this project deploys via the Supabase MCP, which has no secrets API.
// Deployed from git via MCP deploy_edge_function; verify_jwt=false (we do our
// own auth). Source of truth is this file in the repo — never paste-deploy.

// Pinned exact version: a floating "@2" could change resolved types under us.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.0";

const makeClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
type SB = ReturnType<typeof makeClient>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: BufferSource, msg: BufferSource): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, msg);
}

// Validate Telegram Mini App initData. Returns the user object or null.
// Copied verbatim from mahjong-web's track function (the workspace TMA
// standard forbids re-deriving this recipe).
async function validateInitData(initData: string, botToken: string): Promise<Record<string, unknown> | null> {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const enc = new TextEncoder();
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secretKey = await hmac(enc.encode("WebAppData"), enc.encode(botToken));
  const computed = toHex(await hmac(secretKey, enc.encode(dataCheckString)));
  if (computed !== hash) return null;
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null; // 24h freshness
  try {
    return JSON.parse(params.get("user") || "null");
  } catch {
    return null;
  }
}

const randomCode = (n = 6) => {
  const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => alpha[b % alpha.length]).join("");
};

const APP_LINK = "https://t.me/gamepairingbot/matchups";
const MIN_PLAYERS = 3;

async function getConfig(sb: SB, key: string): Promise<string | null> {
  const { data } = await sb.from("sp_config").select("value").eq("key", key).maybeSingle();
  return (data as { value: string } | null)?.value ?? null;
}

// Best-effort group announcement; a kicked/muted bot never blocks an op.
async function announce(sb: SB, chatId: number | null, text: string, joinCode?: string): Promise<void> {
  if (!chatId) return;
  const token = await getConfig(sb, "bot_token");
  if (!token) return;
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (joinCode) {
      body.reply_markup = {
        inline_keyboard: [[{ text: "Open session", url: `${APP_LINK}?startapp=${joinCode}` }]],
      };
    }
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (_) {
    /* ignore */
  }
}

type SessRow = {
  id: string; code: string; chat_id: number | null; creator_id: number; creator_name: string;
  name: string; status: string; format: string; state: unknown; updated_at: string;
};

async function fullState(sb: SB, code: string, uid: number) {
  const { data: s } = await sb.from("sp_sessions").select("*").eq("code", code).maybeSingle();
  if (!s) return null;
  const row = s as SessRow;
  const { data: pl } = await sb.from("sp_players")
    .select("name,tg_id,tg_name").eq("session_id", row.id).order("name");
  const players = ((pl || []) as Array<{ name: string; tg_id: number | null; tg_name: string | null }>)
    .map((p) => ({
      name: p.name,
      claimed: p.tg_id != null,
      mine: p.tg_id != null && Number(p.tg_id) === uid,
      isCreator: p.tg_id != null && Number(p.tg_id) === Number(row.creator_id),
    }));
  return {
    session: {
      code: row.code, name: row.name, status: row.status, format: row.format,
      chatId: row.chat_id, creatorName: row.creator_name,
      isCreator: uid === Number(row.creator_id), updatedAt: row.updated_at,
    },
    players,
    me: players.find((p) => p.mine)?.name ?? null,
    state: row.status !== "lobby" ? row.state : null,
  };
}

// The initial tournament state handed to the organizer's app at start.
// Shape matches the client's session object; the client re-normalizes anyway.
function buildInitialState(name: string, format: string, roster: string[]) {
  return {
    name,
    created: Date.now(),
    updated: Date.now(),
    players: roster.map((n, i) => ({ id: i + 1, name: n, rating: null, active: true })),
    rounds: [],
    nextId: roster.length + 1,
    exceptions: [],
    settings: {
      totalRounds: 6, limitRounds: false, format,
      round1: "fold", trackSpread: true, drawAllowed: true,
      byePoints: 1, byeSpread: 50, firstBalance: true, tbOrder: null,
    },
  };
}

const displayName = (u: Record<string, unknown>): string => {
  const parts = [u.first_name, u.last_name].filter(Boolean).map(String);
  if (parts.length) return parts.join(" ").slice(0, 30);
  if (u.username) return ("@" + u.username).slice(0, 30);
  return "Player " + u.id;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const op = String(body.op || "");
  const sb = makeClient();

  const botToken = await getConfig(sb, "bot_token");
  if (!botToken) return json({ error: "Server is not configured." }, 500);
  const user = await validateInitData(String(body.initData || ""), botToken);
  if (!user || typeof user.id !== "number") return json({ error: "Unauthorized." }, 401);
  const uid = Number(user.id);
  const uname = displayName(user);

  const code = String(body.code || "").toUpperCase().slice(0, 12);
  const reply = async (c: string) => {
    const st = await fullState(sb, c, uid);
    return st ? json(st) : json({ error: "Session not found." }, 404);
  };

  try {
    switch (op) {
      case "create": {
        const name = String(body.name || "Tournament").trim().slice(0, 60) || "Tournament";
        const chatId = body.chatId != null && Number.isFinite(Number(body.chatId)) ? Number(body.chatId) : null;
        const newCode = randomCode();
        const { data: ins, error } = await sb.from("sp_sessions")
          .insert({ code: newCode, chat_id: chatId, creator_id: uid, creator_name: uname, name })
          .select("id").single();
        if (error || !ins) return json({ error: "Could not create the session." }, 500);
        await sb.from("sp_players").insert({ session_id: ins.id, name: uname, tg_id: uid, tg_name: uname });
        if (chatId) {
          await announce(sb, chatId, `${uname} started a tournament lobby: "${name}". Tap to join.`, newCode);
        }
        return reply(newCode);
      }
      case "get":
        return reply(code);
      case "add-name": {
        const nm = String(body.name || "").trim().slice(0, 30);
        if (!nm) return json({ error: "Give the player a name." }, 400);
        const st = await fullState(sb, code, uid);
        if (!st) return json({ error: "Session not found." }, 404);
        if (st.session.status !== "lobby") return json({ error: "The session has already started." }, 409);
        if (st.me == null && !st.session.isCreator) return json({ error: "Join the session first." }, 403);
        const { data: s } = await sb.from("sp_sessions").select("id").eq("code", code).single();
        const { error } = await sb.from("sp_players").insert({ session_id: s!.id, name: nm });
        if (error) return json({ error: "That name is already on the list." }, 409);
        return reply(code);
      }
      case "join": {
        const st = await fullState(sb, code, uid);
        if (!st) return json({ error: "Session not found." }, 404);
        if (st.session.status !== "lobby") return json({ error: "The session has already started." }, 409);
        if (st.me != null) return json({ error: "You already have a spot: " + st.me }, 409);
        const { data: s } = await sb.from("sp_sessions").select("id").eq("code", code).single();
        const claim = String(body.claim || "").trim();
        if (claim) {
          // take an unclaimed roster spot; precondition in the WHERE clause
          const { data: upd } = await sb.from("sp_players")
            .update({ tg_id: uid, tg_name: uname })
            .eq("session_id", s!.id).eq("name", claim).is("tg_id", null)
            .select("name");
          if (!upd || upd.length === 0) return json({ error: "That spot is taken (or gone)." }, 409);
        } else {
          const nick = String(body.nickname || uname).trim().slice(0, 30);
          if (!nick) return json({ error: "Pick a nickname." }, 400);
          const { error } = await sb.from("sp_players")
            .insert({ session_id: s!.id, name: nick, tg_id: uid, tg_name: uname });
          if (error) return json({ error: "That name is already on the list." }, 409);
        }
        return reply(code);
      }
      case "rename": {
        const nm = String(body.newName || "").trim().slice(0, 30);
        if (!nm) return json({ error: "Pick a name." }, 400);
        const st = await fullState(sb, code, uid);
        if (!st) return json({ error: "Session not found." }, 404);
        if (st.session.status !== "lobby") return json({ error: "The session has already started." }, 409);
        const { data: s } = await sb.from("sp_sessions").select("id").eq("code", code).single();
        const { error, data: upd } = await sb.from("sp_players")
          .update({ name: nm }).eq("session_id", s!.id).eq("tg_id", uid).select("name");
        if (error) return json({ error: "That name is already on the list." }, 409);
        if (!upd || upd.length === 0) return json({ error: "Join the session first." }, 403);
        return reply(code);
      }
      case "leave": {
        const st = await fullState(sb, code, uid);
        if (!st) return json({ error: "Session not found." }, 404);
        if (st.session.status !== "lobby") return json({ error: "The session has already started." }, 409);
        if (st.session.isCreator) return json({ error: "The organizer can't leave their own session." }, 409);
        const { data: s } = await sb.from("sp_sessions").select("id").eq("code", code).single();
        await sb.from("sp_players").delete().eq("session_id", s!.id).eq("tg_id", uid);
        return reply(code);
      }
      case "remove-name": {
        const nm = String(body.name || "").trim();
        const { data: s } = await sb.from("sp_sessions")
          .select("id").eq("code", code).eq("creator_id", uid).eq("status", "lobby").maybeSingle();
        if (!s) return json({ error: "Only the organizer can remove names, before the start." }, 403);
        // only unclaimed placeholders are removable — precondition in WHERE
        await sb.from("sp_players").delete().eq("session_id", s.id).eq("name", nm).is("tg_id", null);
        return reply(code);
      }
      case "start": {
        const format = body.format === "roundrobin" ? "roundrobin" : "swiss";
        const st = await fullState(sb, code, uid);
        if (!st) return json({ error: "Session not found." }, 404);
        if (!st.session.isCreator) return json({ error: "Only the organizer can start." }, 403);
        if (st.session.status !== "lobby") return json({ error: "Already started." }, 409);
        if (st.players.length < MIN_PLAYERS) {
          return json({ error: `Need at least ${MIN_PLAYERS} participants to start.` }, 400);
        }
        const roster = st.players.map((p) => p.name);
        const initial = buildInitialState(st.session.name, format, roster);
        // legal prior state: lobby, mine — enforced in the WHERE clause
        const { data: upd } = await sb.from("sp_sessions")
          .update({ status: "active", format, state: initial, updated_at: new Date().toISOString() })
          .eq("code", code).eq("creator_id", uid).eq("status", "lobby")
          .select("chat_id");
        if (!upd || upd.length === 0) return json({ error: "Already started." }, 409);
        await announce(sb, (upd[0] as { chat_id: number | null }).chat_id,
          `Tournament "${st.session.name}" started: ${roster.length} players, ${format === "roundrobin" ? "round robin" : "Swiss"}.`, code);
        return reply(code);
      }
      case "save": {
        const state = body.state;
        if (state == null || typeof state !== "object") return json({ error: "Bad state." }, 400);
        if (JSON.stringify(state).length > 400_000) return json({ error: "State too large." }, 413);
        // single-writer: only the organizer, only while active — in the WHERE
        const { data: upd } = await sb.from("sp_sessions")
          .update({ state, updated_at: new Date().toISOString() })
          .eq("code", code).eq("creator_id", uid).eq("status", "active")
          .select("code");
        if (!upd || upd.length === 0) return json({ error: "Only the organizer can record results." }, 403);
        return reply(code);
      }
      case "end": {
        const { data: upd } = await sb.from("sp_sessions")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .eq("code", code).eq("creator_id", uid).eq("status", "active")
          .select("chat_id,name");
        if (!upd || upd.length === 0) return json({ error: "Only the organizer can end an active session." }, 403);
        await announce(sb, (upd[0] as { chat_id: number | null }).chat_id,
          `Tournament "${(upd[0] as { name: string }).name}" finished — open the app for final standings.`, code);
        return reply(code);
      }
      default:
        return json({ error: "unknown op" }, 400); // stable marker: client treats as version skew
    }
  } catch (e) {
    console.error("session op failed", op, e);
    return json({ error: "Something went wrong — try again." }, 500);
  }
});
