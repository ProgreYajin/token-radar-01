[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ProgreYajin/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ProgreYajin/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# token-radar-01 entry

A token launch radar: ranks 226 pre-token protocols from the snapshot by an
implied-value model, each with a 6-step farm plan.

- `main.ts` reads `/input/snapshot.json`, writes the ranked board to
  `/output/board.json`, copies `dashboard/` and `screenshots/` to `/output`,
  and writes `/output/dossier.json`.
- The dashboard offers board, detail, filtered, live and model views.
- `screenshots/` holds three captures of the dashboard: the board, a
  protocol detail view, and a filtered view.
