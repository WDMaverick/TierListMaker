# TierListMaker (WTL)

A TierMaker-style tier list builder for League of Legends, made for ranking champions with a competitive team. Styled to match the WTL Championship site (navy, blue and magenta; Oswald + Public Sans).

## Features

- Every champion, loaded live from Riot's Data Dragon (new champions appear automatically)
- Drag and drop champions into tiers, between tiers, and back to the pool (mouse and touch)
- Default S / A / B / C / D tiers; rename labels inline, recolor, add, reorder, clear or delete rows
- Search the champion pool
- **Player Pools** tab: 5 player slots with name, role and champion pool. Drag from a player's pool straight into the tier list. The same champion can be ranked once per player, and each entry gets a role tag (TOP / JGL / MID / BOT / SUP); a badge on pool champions shows their tier
- **Bot Lane Pairings** (6th slot): build ADC & Support duos from any champions (with quick filters for your Bot and Support players' pools). Champions can appear in many pairs, and each pair ranks as a single "Champion & Champion" tile
- **Substitutes**: add as many extra player slots as you need; their champions get a SUB role tag (e.g. SUB MID)
- **Show / hide** (eye button) on every player, substitute and the pairings card: hides their entries on the tier list while keeping the pool and each entry's position
- Download the tier list as a PNG
- Copy a share link that opens the exact same list for a teammate
- Export / import tier lists as JSON
- Autosaves in the browser
- **Google sign-in** (top right): save tier lists to your account, autosave them, and open them on any device

## Run it

It's a static site with no build step. Serve the folder (sign-in needs a web server, not a `file://` page):

```bash
python3 -m http.server 8000
```

## Host it on GitHub Pages

In the repo, go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`. The site will be live at `https://<your-username>.github.io/TierListMaker/`.

League of Legends and champion images are © Riot Games. This project isn't endorsed by Riot Games.

## Updating

`index.html` loads `style.css?v=…` and `app.js?v=…`. Bump that version whenever you change those files, so browsers fetch the new code instead of a cached copy.

## Accounts (Google sign-in)

Sign-in and saved lists use [Firebase](https://firebase.google.com/) (free Spark plan). One-time setup:

1. Go to the [Firebase console](https://console.firebase.google.com/), click **Add project**, and create it (Google Analytics is optional).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, pick a support email, and save.
3. **Authentication → Settings → Authorized domains → Add domain**: `wdmaverick.github.io` (`localhost` is there by default).
4. **Build → Firestore Database → Create database** (production mode, any location). Then open the **Rules** tab, replace everything with the rules below, and **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/lists/{listId} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. **Project settings (⚙) → General → Your apps → Web (`</>`)**, register an app (no hosting needed), and copy the `firebaseConfig` object into `firebase-config.js` as `window.FIREBASE_CONFIG = { ... }`.

The config values aren't secret; the rules above make sure each person can only read and write their own lists.

How it works: each list is stored at `users/{uid}/lists/{listId}`. After you save a list to your account (or open one), every change autosaves to it. Opening the site on another device and signing in shows your saved lists. If two devices edit the same list at once, the last save wins.
