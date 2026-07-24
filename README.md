# Match Pairing — Tournament Manager

A tournament pairing manager (Swiss system and round robin) in a single
self-contained `index.html`. No server, no build step, no dependencies — runs
entirely in the browser on desktop and phone. State persists to `localStorage`.

**Live:** https://thnwng.github.io/match-pairing/
**Telegram:** the app is wired to `@gamepairingbot` as a Mini App — the bot's
"Pairings" menu button opens this page inside Telegram (theme-synced via
`telegram-web-app.js`; identical behavior in a normal browser). The bot token
lives in the gitignored `.env` (see `.env.example`) and is used only by local
admin scripts to configure the bot; the page itself never sees it.

**Group sessions** (the mahjong-web link-first mechanism): add the bot to a
group — it greets with an **Open Pairings** button (`/start` or `/open` repost
it) whose deep link carries the group id. That opens the group's session home:
its tournaments, or **create one in the app**, which posts a join button
(`t.me/gamepairingbot/matchups?startapp=CODE`) into the chat. **Opening the
link puts you in** (unseated); the lobby lists the roster — tap **"This is
me"** on your name, join under a new name, or add offline players as
placeholders; rename or leave any time before the start. The organizer starts
the event at 3+ roster names, picking Swiss or round robin, then runs the
tournament in the full app — every save syncs to the backend — while everyone
else sees live standings and the current round, refreshing automatically.
Backend: Supabase Edge Functions (`supabase/functions/session`, `bot`) with
Telegram initData validated server-side on every call (HMAC, per the workspace
TMA standard); tables are RLS-on/zero-policy, service-role only; seat claims
are race-safe via a unique index; the webhook checks its secret token
fail-closed. Deploys go through the Supabase MCP from these files — the repo
is the source of truth.

## Features

- **Multiple tournaments** — welcome screen to create (name + date), open, rename,
  and delete saved tournaments; each is fully independent.
- **Players** — single or bulk add ("Name, rating" per line), edit name/rating in
  place, withdraw/reinstate, request a half-point bye for the next round,
  duplicate-name warning on add.
- **Two formats** — Swiss system or round robin, chosen at creation (or in
  Settings). Round robin uses the circle method: every pair meets exactly once
  per cycle; odd fields get a rotating bye (each player exactly one per cycle);
  after a full cycle it continues as a double round robin.
- **Pairings (Swiss)** — round 1 by fold / adjacent / random; later rounds pair
  within score groups with rematch avoidance (exhaustive backtracking, rematches
  only when unavoidable). Byes go to the lowest-scoring player without a prior
  bye, chosen so the bye never forces an avoidable rematch. Optional
  first-move/colour balancing. Unlimited rounds by default, with an optional
  round cap. Pairing cards show each player's score and flag rematches.
- **Fixed pairings** — force two players to meet in a chosen future round; the
  generator seats them and pairs everyone else around it (in round robin it
  reorders the schedule so the cycle stays intact). A warning appears if a fix
  can't be honoured.
- **Adjust pairings** — manual override on any unscored board: swap players
  between boards, reassign the bye, or flip who goes first.
- **Results** — Scrabble-style score entry with point-spread tracking, or chess-style
  Win/Draw/Loss buttons; forfeits, no-shows, double forfeits; four bye types
  (pairing / full / half / zero point).
- **Standings** — live, with a configurable, re-orderable tiebreak list; CSV export.
  Head-to-head is resolved group-wise (FIDE direct-encounter style; circular ties
  stay tied and fall through to the next criterion).
- **Crosstable** — chess-results-style grid (result + opponent start number per
  round); CSV export with chess-results codes (W12 / L3 / +F7 / BYE:half).
- **Copy results** — copy neatly formatted results up to any chosen match to the
  clipboard (with a manual-copy fallback when the clipboard is blocked).
- **Final report (LaTeX)** — once every round is complete, the Standings tab
  offers "Report (.tex)": a LaTeX document with the final standings on page one
  (position / name / wins / spread) and a page per player giving their
  game-by-game record (round, W-L before, opponent, spread, W-L after) with a
  W-L / total-spread summary. Compile it with Overleaf or a local `pdflatex`
  to produce the PDF. (Byes and absences follow the app's own accounting: they
  do not change the W-L record, but their spread still counts toward the total.)
- **Import / Export** — full tournament JSON export/import; standings and
  crosstable CSV.

## Tiebreaks — FIDE C.07 (2023) verified

Buchholz, Buchholz Cut-1, Sonneborn-Berger, and SB Cut-1 implement the FIDE
C.07 (2023) rules, including the virtual-opponent rule for unplayed rounds,
withdrawn-opponent adjustment, and the Cut-1 least-significant-opponent rule.
The engine reproduces **all 80 published values** of IA Mario Held's official FIDE
"Exercises in Tie-Breaking" worked example (16-player Swiss) through the real
application code path. Also available: cumulative (progressive), wins,
head-to-head, rating, and cumulative point spread.

The oracle fixture is committed at `tests/fide-oracle-test.js` — paste it into
the browser console after any change to the tiebreak/standings code; it must
report `passed: 80`.

## Structure

```
index.html    the entire app (CSS + HTML + JS)
halcyon-ds/   vendored Halcyon design-system styles (tokens + components)
tests/        console-paste regressions: FIDE C.07 oracle (80 values) and
              round-robin/fixed-pairing properties — run after engine changes
.env.example  key catalog for the @gamepairingbot admin scripts (.env gitignored)
```

## Run locally

Open `index.html` in a browser, or serve the folder:

```
py -m http.server 8123 -d match-pairing
```

## Deploy

GitHub Pages serves the `main` branch root. Commit to `main` and push;
Pages rebuilds automatically (~30 s).
