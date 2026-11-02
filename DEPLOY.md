# Putting Thornwood on the web (Vercel + Firebase)

The website is one static page (`web/index.html`) hosted on **Vercel**. Online games are stored in **Firebase Firestore**, and players are signed in anonymously in the background so nobody has to make an account. Both services are free at this size.

It takes about 20 minutes. You need a GitHub account and a Google account.

---

## Step 1. Put the code on GitHub

1. Go to https://github.com/new.
2. Name the repository `thornwood`. Private or public both work.
3. **Don't** tick "Add a README", ".gitignore" or "license". The repository must start empty.
4. Click **Create repository**, then tell Claude the repository name (for example `your-username/thornwood`). Claude pushes the code to it.

## Step 2. Create the Firebase project

1. Go to https://console.firebase.google.com and click **Create a project** (or **Add project**).
2. Name it `thornwood`, click through, and switch **Google Analytics off**. Click **Create project**.

### 2a. Turn on anonymous sign-in
1. In the left menu: **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab, click **Anonymous**, switch it **on**, and click **Save**.

### 2b. Create the database
1. In the left menu: **Build → Firestore Database → Create database**.
2. Choose a location near your players, for example `us-central` or `eur3`. You can't change it later.
3. Choose **Start in production mode** and click **Create**.

### 2c. Set the security rules
1. In Firestore, open the **Rules** tab.
2. Delete what's there, paste in the contents of `firestore.rules` from this project, and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{code} {
      allow read, write: if request.auth != null
                         && code.matches('^[A-Z]{4}$');
    }
  }
}
```

### 2d. Get your web config
1. Click the gear icon next to **Project Overview**, then **Project settings**.
2. Under **Your apps**, click the **</>** (Web) icon.
3. Give it a nickname such as `thornwood-web`. **Don't** tick Firebase Hosting. Click **Register app**.
4. Firebase shows a block like this:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "thornwood-1234.firebaseapp.com",
  projectId: "thornwood-1234",
  storageBucket: "thornwood-1234.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

5. Copy those six values into `web/firebase-config.js`, replacing each `PASTE...` value. You can do this in two ways:
   - On GitHub: open `web/firebase-config.js`, click the pencil icon, edit, and click **Commit changes**.
   - Or paste the block to Claude, and Claude commits it.

These values aren't secret. Every Firebase website ships them to the browser, and the security rules from step 2c protect the data.

## Step 3. Deploy on Vercel

1. Go to https://vercel.com and sign up with **Continue with GitHub**.
2. Click **Add New… → Project**, find the `thornwood` repository and click **Import**. If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to it.
3. On the configure screen:
   - **Framework Preset:** `Other`
   - **Root Directory:** click **Edit** and choose `web`
   - Leave the build and output settings as they are. There's nothing to build.
4. Click **Deploy**. About a minute later you get a link like `https://thornwood-xyz.vercel.app`.

## Step 4. Allow your site in Firebase

1. In Firebase: **Authentication → Settings → Authorized domains → Add domain**.
2. Add your Vercel domain, for example `thornwood-xyz.vercel.app`, without `https://`. Add your custom domain too if you set one up later.

## Step 5. Test it

1. Open your site. On the home page you should see **Play online with friends**.
2. Click **Create a game** to get a 4-letter room code.
3. Open the site in a second browser or a private window, enter the code and click **Join**.
4. Back in the first window, start the game. Moves should appear in both windows.

If the online box doesn't appear, open the browser console (F12 → Console). A message starting with `Online play is unavailable` gives the reason. Usually a config value is wrong (step 2d) or anonymous sign-in is off (step 2a).

---

## Later

- **Updating the game.** Change the source in `artifact/`, run `node artifact/build.js`, then commit and push. Vercel redeploys automatically on every push.
- **Custom domain.** In Vercel: **Project → Settings → Domains → Add**, then add the same domain in Firebase step 4.
- **Free limits.** Firebase's free plan allows 50,000 reads and 20,000 writes a day. One move is 1 write plus 1 read per player watching, so a 4-player game uses roughly 300 writes and 1,200 reads. That's dozens of games a day for free.
- **Cleaning up old games** (optional). Each game is one small document under `games/`. You can delete old ones in the Firestore **Data** tab.
- **Security note.** The rules let any visitor read and edit any game whose code they know. That's fine for playing with friends, but a determined player could cheat by editing the game data or peeking at hands. If the game gets bigger, the next step is a small server that checks every move.
