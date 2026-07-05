# Swiss Pairing — Tournament Manager

A Swiss-system tournament pairing manager in a single self-contained `index.html`.
No server, no build step, no dependencies — runs entirely in the browser on desktop
and phone. State persists to `localStorage`.

**Live:** https://thnwng.github.io/swiss-pairing/

## Features

- **Multiple tournaments** — welcome screen to create (name + date), open, rename,
  and delete saved tournaments; each is fully independent.
- **Players** — single or bulk add ("Name, rating" per line), edit name/rating in
  place, withdraw/reinstate, request a half-point bye for the next round,
  duplicate-name warning on add.
- **Pairings** — round 1 by fold / adjacent / random; later rounds pair within score
  groups with rematch avoidance (exhaustive backtracking, rematches only when
  unavoidable). Byes go to the lowest-scoring player without a prior bye, chosen
  so the bye never forces an avoidable rematch. Optional first-move/colour
  balancing. Unlimited rounds by default, with an optional round cap. Pairing
  cards show each player's score and flag rematches.
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
tests/        FIDE C.07 oracle regression (paste into DevTools console)
```

## Run locally

Open `index.html` in a browser, or serve the folder:

```
py -m http.server 8123 -d swiss-pairing
```

## Deploy

GitHub Pages serves the `main` branch root. Commit to `main` and push;
Pages rebuilds automatically (~30 s).
