// Supabase Edge Function: multi-user tournament sessions for the swiss-pairing
// Mini App (@gamepairingbot). Client calls POST { op, initData, ...payload }.
// Telegram initData is validated (HMAC with the bot token) on every call; the
// service role touches the DB; no DB capability ever reaches the client.
//
// The join mechanism mirrors mahjong-web (the workspace TMA reference) exactly:
//   * the bot only posts an Open button carrying g<chatId>; SESSIONS ARE
//     CREATED IN THE APP (create carries the chatId, then the join button
//     with the bare share code is announced into the chat)
//   * `open` = opening a session's link makes you an unseated MEMBER
//     (idempotent); watching needs no seat
//   * the roster is a list of names (placeholders welcome, any member can
//     add); `claim` takes an existing name ("This is me"), `join-new` seats
//     you under a brand-new name; claims are announced to the bound chat
//   * unique (session_id, name) makes concurrent claims race-safe
//
// Secrets (bot token, webhook secret) live in the service-role-only sp_config
// table — this project deploys via the Supabase MCP, which has no secrets API.
// Deployed from git; verify_jwt=false (we do our own auth). Never paste-deploy.

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
const ROSTER_MAX = 64;
const NAME_MAX = 30;
const validName = (s: string) => s.length >= 1 && s.length <= NAME_MAX;

async function getConfig(sb: SB, key: string): Promise<string | null> {
  const { data } = await sb.from("sp_config").select("value").eq("key", key).maybeSingle();
  return (data as { value: string } | null)?.value ?? null;
}

// Best-effort chat messages; a kicked/muted bot never blocks an op.
async function announce(sb: SB, chatId: number | null, text: string, joinCode?: string): Promise<void> {
  if (!chatId) return;
  const token = await getConfig(sb, "bot_token");
  if (!token) return;
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (joinCode) {
      body.reply_markup = {
        inline_keyboard: [[{ text: "Open the tournament", url: `${APP_LINK}?startapp=${joinCode}` }]],
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
  name: string; status: string; format: string; state: unknown; roster: string[]; updated_at: string;
};

async function loadSession(sb: SB, code: string): Promise<SessRow | null> {
  const { data } = await sb.from("sp_sessions").select("*").eq("code", code).maybeSingle();
  return (data as SessRow | null) ?? null;
}

async function fullState(sb: SB, row: SessRow, uid: number) {
  const { data: mem } = await sb.from("sp_members")
    .select("tg_id,name").eq("session_id", row.id);
  const members = (mem || []) as Array<{ tg_id: number; name: string | null }>;
  const claimedBy = new Map(members.filter((m) => m.name != null).map((m) => [m.name as string, Number(m.tg_id)]));
  const roster = Array.isArray(row.roster) ? row.roster : [];
  const players = roster.map((n) => ({
    name: n,
    claimed: claimedBy.has(n),
    mine: claimedBy.get(n) === uid,
    isCreator: claimedBy.get(n) === Number(row.creator_id),
  }));
  const myRow = members.find((m) => Number(m.tg_id) === uid);
  return {
    session: {
      code: row.code, name: row.name, status: row.status, format: row.format,
      chatId: row.chat_id, creatorName: row.creator_name,
      isCreator: uid === Number(row.creator_id), updatedAt: row.updated_at,
    },
    players,
    me: myRow?.name ?? null,           // your claimed seat (null = unseated)
    isMember: !!myRow,                 // you're in the session (maybe unseated)
    state: row.status !== "lobby" ? row.state : null,
  };
}

// The initial tournament state handed to the organizer's app at start.
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
  if (parts.length) return parts.join(" ").slice(0, NAME_MAX);
  if (u.username) return ("@" + u.username).slice(0, NAME_MAX);
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

  try {
    // ---- ops that don't need an existing session ----
    if (op === "create") {
      // Sessions are created IN THE APP (mahjong pattern). When launched from a
      // group (g<chatId>), the chat is bound and the join button is announced.
      const name = String(body.name || "Tournament").trim().slice(0, 60) || "Tournament";
      const chatId = body.chatId != null && Number.isFinite(Number(body.chatId)) ? Number(body.chatId) : null;
      const newCode = randomCode();
      const { data: ins, error } = await sb.from("sp_sessions")
        .insert({ code: newCode, chat_id: chatId, creator_id: uid, creator_name: uname, name })
        .select("*").single();
      if (error || !ins) return json({ error: "Could not create the session." }, 500);
      // the creator joins immediately (unseated) so the session is theirs
      await sb.from("sp_members").insert({ session_id: (ins as SessRow).id, tg_id: uid, tg_name: uname, name: null });
      if (chatId) {
        await announce(sb, chatId,
          `${uname} opened a tournament lobby: "${name}". Tap to join — claim your name or add yourself. Needs ${MIN_PLAYERS}+ players.`,
          newCode);
      }
      return json(await fullState(sb, ins as SessRow, uid));
    }
    if (op === "list-by-chat") {
      // Sessions bound to a Telegram group, so members can reopen them.
      const tgChatId = Number(body.tgChatId);
      if (!Number.isFinite(tgChatId)) return json({ sessions: [] });
      const { data } = await sb.from("sp_sessions")
        .select("code,name,status,roster,created_at")
        .eq("chat_id", tgChatId)
        .order("created_at", { ascending: false })
        .limit(10);
      const sessions = ((data || []) as Array<{ code: string; name: string; status: string; roster: string[] }>)
        .map((s) => ({ code: s.code, name: s.name, status: s.status, players: (s.roster || []).length }));
      return json({ sessions });
    }

    const row = await loadSession(sb, code);
    if (!row) return json({ error: "Session not found." }, 404);
    const reply = async () => json(await fullState(sb, (await loadSession(sb, code))!, uid));

    switch (op) {
      case "open": {
        // Opening a session's link puts you IN it (unseated member) so you can
        // add names, claim a seat, or just watch. Idempotent.
        const { error: ie } = await sb.from("sp_members")
          .insert({ session_id: row.id, tg_id: uid, tg_name: uname, name: null });
        if (ie && ie.code !== "23505") throw ie; // 23505 = already a member; keep the (maybe seated) row
        return reply();
      }
      case "get":
        return json(await fullState(sb, row, uid));
      case "add-name": {
        // Add a placeholder name to the roster. Anyone already in can do this.
        const st = await fullState(sb, row, uid);
        if (!st.isMember) return json({ error: "Open the session first." }, 403);
        if (row.status !== "lobby") return json({ error: "The tournament has already started." }, 409);
        const raw = String(body.name || "").trim();
        if (!validName(raw)) return json({ error: `Names are 1-${NAME_MAX} characters.` }, 400);
        const roster = Array.isArray(row.roster) ? row.roster : [];
        if (roster.includes(raw)) return json({ error: "That name is already on the list." }, 409);
        if (roster.length >= ROSTER_MAX) return json({ error: `The list is full (${ROSTER_MAX}).` }, 400);
        const { error: re } = await sb.rpc("sp_add_name", { p_id: row.id, p_name: raw });
        if (re) throw re;
        return reply();
      }
      case "claim":
      case "join-new": {
        // Take a seat: an existing roster name ("This is me") or a brand-new one
        // (join-new, which also adds it to the roster). An unseated member's row
        // is FILLED; a non-member gets inserted seated. Race-safe via the unique
        // (session_id, name) index — the loser gets 23505.
        if (row.status !== "lobby") return json({ error: "The tournament has already started." }, 409);
        const { data: memRow } = await sb.from("sp_members").select("name")
          .eq("session_id", row.id).eq("tg_id", uid).maybeSingle();
        const mem = memRow as { name: string | null } | null;
        if (mem && mem.name) return json({ error: "You already have a spot: " + mem.name }, 409);
        const roster = Array.isArray(row.roster) ? row.roster : [];

        let seat: string;
        if (op === "claim") {
          seat = String(body.player || "");
          if (!roster.includes(seat)) return json({ error: "No such name on the list." }, 400);
        } else {
          seat = String(body.name || uname).trim();
          if (!validName(seat)) return json({ error: `Names are 1-${NAME_MAX} characters.` }, 400);
          if (roster.includes(seat)) return json({ error: "That name is already on the list — claim it instead." }, 409);
          if (roster.length >= ROSTER_MAX) return json({ error: `The list is full (${ROSTER_MAX}).` }, 400);
        }

        if (mem) {
          const { data: upd, error: ue } = await sb.from("sp_members")
            .update({ name: seat, tg_name: uname })
            .eq("session_id", row.id).eq("tg_id", uid).is("name", null).select("tg_id");
          if (ue) {
            if (ue.code === "23505") return json({ error: "That name was just taken." }, 409);
            throw ue;
          }
          if (!upd || !upd.length) {
            const { data: re } = await sb.from("sp_members").select("name")
              .eq("session_id", row.id).eq("tg_id", uid).maybeSingle();
            if ((re as { name?: string } | null)?.name !== seat) return json({ error: "That name was just taken." }, 409);
          }
        } else {
          const { error: ie } = await sb.from("sp_members")
            .insert({ session_id: row.id, tg_id: uid, tg_name: uname, name: seat });
          if (ie) {
            if (ie.code === "23505") return json({ error: "That name was just taken, or you already joined." }, 409);
            throw ie;
          }
        }
        // join-new adds the name to the roster AFTER the seat is set, so a failed
        // claim never leaves an orphan roster name (sp_add_name is idempotent)
        if (op === "join-new" && !roster.includes(seat)) {
          const { error: re } = await sb.rpc("sp_add_name", { p_id: row.id, p_name: seat });
          if (re) throw re;
        }
        await announce(sb, row.chat_id, `${seat} joined the tournament.`);
        return reply();
      }
      case "rename": {
        // Rename your claimed seat (lobby only); the roster entry follows.
        if (row.status !== "lobby") return json({ error: "The tournament has already started." }, 409);
        const nm = String(body.newName || "").trim();
        if (!validName(nm)) return json({ error: `Names are 1-${NAME_MAX} characters.` }, 400);
        const { data: memRow } = await sb.from("sp_members").select("name")
          .eq("session_id", row.id).eq("tg_id", uid).maybeSingle();
        const old = (memRow as { name: string | null } | null)?.name;
        if (!old) return json({ error: "Claim a spot first." }, 403);
        const roster = Array.isArray(row.roster) ? row.roster : [];
        if (roster.includes(nm)) return json({ error: "That name is already on the list." }, 409);
        const { error: ue } = await sb.from("sp_members")
          .update({ name: nm }).eq("session_id", row.id).eq("tg_id", uid);
        if (ue) {
          if (ue.code === "23505") return json({ error: "That name was just taken." }, 409);
          throw ue;
        }
        await sb.rpc("sp_rename_name", { p_id: row.id, p_old: old, p_new: nm });
        return reply();
      }
      case "leave": {
        // Drop out of the lobby. A claimed seat's name stays on the roster as a
        // claimable placeholder (mahjong behavior); membership row goes away.
        if (row.status !== "lobby") return json({ error: "The tournament has already started." }, 409);
        if (uid === Number(row.creator_id)) return json({ error: "The organizer can't leave their own session." }, 409);
        await sb.from("sp_members").delete().eq("session_id", row.id).eq("tg_id", uid);
        return reply();
      }
      case "remove-name": {
        // Remove an UNCLAIMED placeholder from the roster. Any seated member.
        if (row.status !== "lobby") return json({ error: "The tournament has already started." }, 409);
        const st = await fullState(sb, row, uid);
        if (st.me == null && !st.session.isCreator) return json({ error: "Claim a spot first." }, 403);
        const nm = String(body.name || "");
        const target = st.players.find((p) => p.name === nm);
        if (!target) return json({ error: "No such name on the list." }, 404);
        if (target.claimed) return json({ error: "That name is claimed by a player." }, 409);
        await sb.rpc("sp_remove_name", { p_id: row.id, p_name: nm });
        return reply();
      }
      case "start": {
        const format = body.format === "roundrobin" ? "roundrobin" : "swiss";
        if (uid !== Number(row.creator_id)) return json({ error: "Only the organizer can start." }, 403);
        if (row.status !== "lobby") return json({ error: "Already started." }, 409);
        const roster = Array.isArray(row.roster) ? row.roster : [];
        if (roster.length < MIN_PLAYERS) {
          return json({ error: `Need at least ${MIN_PLAYERS} players on the list to start.` }, 400);
        }
        const initial = buildInitialState(row.name, format, roster);
        // legal prior state: lobby, mine — enforced in the WHERE clause
        const { data: upd } = await sb.from("sp_sessions")
          .update({ status: "active", format, state: initial, updated_at: new Date().toISOString() })
          .eq("code", code).eq("creator_id", uid).eq("status", "lobby")
          .select("chat_id");
        if (!upd || upd.length === 0) return json({ error: "Already started." }, 409);
        await announce(sb, row.chat_id,
          `Tournament "${row.name}" started: ${roster.length} players, ${format === "roundrobin" ? "round robin" : "Swiss"}. Standings stay live in the app.`, code);
        return reply();
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
        return reply();
      }
      case "end": {
        const { data: upd } = await sb.from("sp_sessions")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .eq("code", code).eq("creator_id", uid).eq("status", "active")
          .select("chat_id,name");
        if (!upd || upd.length === 0) return json({ error: "Only the organizer can end an active session." }, 403);
        await announce(sb, (upd[0] as { chat_id: number | null }).chat_id,
          `Tournament "${(upd[0] as { name: string }).name}" finished — open the app for final standings.`, code);
        return reply();
      }
      default:
        return json({ error: "unknown op" }, 400); // stable marker: client treats as version skew
    }
  } catch (e) {
    console.error("session op failed", op, e);
    return json({ error: "Something went wrong — try again." }, 500);
  }
});
