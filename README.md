# TierListMaker

A TierMaker-style tier list builder for League of Legends, made for ranking champions with a competitive team.

## Features

- Every champion, loaded live from Riot's Data Dragon (new champions appear automatically)
- Drag and drop champions into tiers, between tiers, and back to the pool (mouse and touch)
- Default S / A / B / C / D tiers; rename labels inline, recolor, add, reorder, clear or delete rows
- Search the champion pool
- **Player Pools** tab: 5 player slots with name, role and champion pool. Drag from a player's pool straight into the tier list. The same champion can be ranked once per player, and each entry gets a role tag (TOP / JGL / MID / BOT / SUP); a badge on pool champions shows their tier
- **Bot Lane Pairings** (6th slot): build ADC & Support duos from any champions (with quick filters for your Bot and Support players' pools). Champions can appear in many pairs, and each pair ranks as a single "Champion & Champion" tile
- Download the tier list as a PNG
- Copy a share link that opens the exact same list for a teammate
- Export / import tier lists as JSON
- Autosaves in the browser

## Run it

It's a static site with no build step. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

## Host it on GitHub Pages

In the repo, go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`. The site will be live at `https://<your-username>.github.io/TierListMaker/`.

League of Legends and champion images are © Riot Games. This project isn't endorsed by Riot Games.

## Updating

`index.html` loads `style.css?v=…` and `app.js?v=…`. Bump that version whenever you change those files, so browsers fetch the new code instead of a cached copy.
