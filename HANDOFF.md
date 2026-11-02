# Thornwood: where we left off

## What this is
Thornwood is an original asymmetric woodland war game for 2–4 players, built as a single web page.
- Factions: Badger Clans, Rabbit Warrens, Owl Parliament and Otter Company. Each has its own Dawn / Day / Dusk turn phases.
- Map: 13 clearings (meadow / marsh / grove), building slots and a river. The first to 30 renown wins.
- Includes solo play against heuristic AI, online multiplayer through room codes, an illustrated SVG map with individual pieces, a card dock, step-by-step playback of every move, a phase tracker and a tutorial modal.

## Project layout
- `artifact/template.html` + `artifact/app.js`: the source for the game page (UI, playback, tutorial, phases).
- `public/engine.js`: the rules engine. `public/ai.js`: the AI. Both are shared by every version.
- `artifact/build.js`: run `node artifact/build.js` after any change. It builds:
  - `web/index.html`: **the website version** (uses Firebase; settings in `web/firebase-config.js`)
  - `artifact/thornwood.html`: the version published on claude.ai (uses claude.ai's shared storage)
- `web-src/firebase-shim.js`: connects the website version to Firebase (Firestore + anonymous sign-in).
- `firestore.rules`: the Firestore security rules.
- `DEPLOY.md`: step-by-step deployment to Vercel + Firebase.
- `server.js` and `public/index.html` / `client.js` / `style.css`: an older self-hosted Node version with a plainer UI. Not used for deployment.

## Status
- [x] Game, AI, visuals, phases and tutorial done; tested in a browser.
- [x] Website build done; online flow tested against a mock Firebase.
- [x] Local git repository with one commit on `main`.
- [ ] **Next:** create an empty GitHub repo and push this project to it.
- [ ] Create the Firebase project (anonymous auth, Firestore, rules) and paste its config into `web/firebase-config.js`.
- [ ] Import the repo into Vercel (Framework: Other, Root Directory: `web`) and deploy.
- [ ] Add the Vercel domain to Firebase → Authentication → Authorized domains.
- [ ] Test online play with two browsers on the live site.

## Also
The claude.ai version is published at https://claude.ai/artifact/NC7SoeVpdTXSBvpCGHFTZW. To update it, read it first with the Artifact tool, then republish `artifact/thornwood.html` with that URL.
