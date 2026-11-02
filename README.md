# Thornwood

**To put the game on your own website (Vercel + Firebase), follow [DEPLOY.md](DEPLOY.md).**

An original asymmetric woodland war game for 2–4 players, played online in the browser. Empty seats can be filled with AI players.

## Run it

```bash
npm start
```

Then open http://localhost:3000 (you can set a different port with `PORT=8080 npm start`). There are no dependencies to install; it needs only Node 18 or newer.

## Play with friends online

1. Click **Create a game**. You become the host.
2. Send the invite link or the 4-letter room code. Friends who join fill the "Human" seats.
3. Add seats (up to 4), pick factions, and set any seat to **AI**.
4. Click **Start game**.

For friends outside your network, the server must be reachable from the internet. Options:
- Deploy the folder to a Node host such as Render, Railway, Fly.io or a VPS. The start command is `npm start`, and the server reads `PORT` from the environment.
- Or tunnel your local server with `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`.

Game rooms are kept in memory, so restarting the server ends any games in progress.

## Files

- `public/engine.js`: rules engine. The server and browser share it, and the server is authoritative.
- `public/ai.js`: heuristic AI opponents.
- `web/`: the website version (deploy this folder). `web/firebase-config.js` holds your Firebase settings.
- `artifact/`: the source for the single-page game (`template.html`, `app.js`) and `build.js`, which builds both `web/index.html` and the claude.ai version. Run `node artifact/build.js` after changing the source.
- `web-src/firebase-shim.js`: connects the website version to Firebase.
- `firestore.rules`: the database security rules to paste into Firebase.
- `server.js` and `public/index.html`, `client.js`, `style.css`: an older self-hosted Node version with a plainer interface.

The full rules are under the **Rules** button in the game.
