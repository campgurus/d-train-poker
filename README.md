# The Ledger — Preflop GTO Trainer

Static, no-backend preflop trainer for 6-max 100bb NLH (RFI + BB defense),
using your own GTO Wizard solver data. Progress is saved in the browser via
`localStorage` — no login, no server, no database.

## Hosting on GitHub Pages

1. Create a new repo (public or private, either works for Pages) and add
   these four files to the root: `index.html`, `style.css`, `app.js`,
   `data.json`.
2. Push to GitHub.
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch",
   pick your default branch (e.g. `main`) and `/ (root)`, then save.
5. GitHub will give you a URL like
   `https://<your-username>.github.io/<repo-name>/`. That's the link to share
   with friends.

Every time you push an update to these files, the same URL updates within a
minute or two — everyone's saved progress stays put, because `localStorage`
is tied to the URL's origin, not to the file contents.

## How progress works

- On first visit, you're asked for a name (no password) — this just keeps
  people using the same computer/browser from overwriting each other's data.
- Everything is saved under `localStorage` keys scoped to that name. Clearing
  browser data/site data for this URL will erase it — there's no server
  backup.
- Use the **Export progress** button any time to download a `.json` backup.
  **Import progress** restores from that file (overwrites current progress
  for the active profile).
- Switching to a different browser, computer, or Pages URL means starting a
  new local dataset — `localStorage` doesn't sync across any of those.

## Updating the data

`data.json` is a combined dump of the 10 solver-derived JSON files
(`rfi_*.json`, `bb_vs_*.json`). If you regenerate solver data, rebuild this
file the same way: merge all 10 into
`{"RFI": {UTG:{...}, HJ:{...}, ...}, "BB": {UTG:{...}, ...}}` and replace
`data.json`. No other file needs to change.
