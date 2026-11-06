# Thornwood

An original strategy board game for 2 to 4 players that you play in the browser. Four woodland factions fight over a forest, and each one plays by its own rules. Play solo against AI opponents, or create a room and invite friends to play online.

<!-- Live site: add your Vercel link here -->
<!-- ![Thornwood game board](docs/board.png) -->

## Features

- **4 asymmetric factions:** each has its own resources, actions, and way to score
- **Solo mode:** fill any seat with an AI opponent on Easy, Medium, or Hard
- **Online multiplayer:** create a room, share the 4-letter code or invite link, and friends join from their own browsers
- **Mix humans and AI:** in an online game, any empty seat can be an AI player
- **Animated turns:** every move by the AI or other players plays out on the map, at Slow, Normal, or Fast speed
- **Two art styles:** a clean Simple style, or an Artistic autumn storybook style with hand-inked lines and critter art
- **Built-in tutorial:** a step-by-step guide covers the rules, each faction, and how to take a turn
- **Light and dark mode** in the Simple style

## The Factions

| Faction | Style | Special ability |
| --- | --- | --- |
| **Badger Clans** | Builders who turn stone into setts and hold them stubbornly | **Stubborn:** hit on 3+ instead of 4+ when defending |
| **Rabbit Warrens** | A swarm that breeds fast and spreads wide | **Swarm:** 28 rabbits, more critters than any other faction |
| **Owl Parliament** | Few, fierce flyers who hunt other factions and raise nests | **Talons:** each owl rolls 2 dice in battle (up to 4) |
| **Otter Company** | River merchants who pay coins to act | **Tolls:** gain 1 coin whenever another faction moves into a clearing with your trading post |

## How to Play

- **Goal:** the first player to **30 renown** wins right away. After 20 rounds, the player with the most renown wins.
- **The map:** 13 clearings connected by paths, some of which cross a river. Each clearing is a meadow, marsh, or grove and has slots for buildings.
- **Ruling:** whoever has the most pieces (critters plus buildings) in a clearing rules it. A tie means nobody does.
- **Seasons:** the season changes every round, and several factions score extra for the season's terrain.
- **Turns:** each turn runs in three phases:
  - **Dawn:** your faction gets its boost (stone, new rabbits, actions, or coins)
  - **Day:** move, attack, build, recruit, and play cards
  - **Dusk:** score renown your faction's way, draw cards, and discard down to 5
- **Battle:** each side rolls one die per critter (up to 3), and every 4 or higher is a hit. Hits remove critters first, then buildings.
- **Cards:** cards pay terrain costs and have effects such as Rally, Forage, and Ambush. An Ambush defends you automatically when you're attacked.

The full rules are under **How to play** in the game.

## How It's Built

Thornwood is written in plain JavaScript with no frameworks and no npm packages.

- **Game engine (`public/engine.js`):** all the rules, battles, scoring, and turn order in one file. Every version of the game shares it.
- **AI opponents (`public/ai.js`):** the AI scores every legal move and picks the best one. Easy and Medium add random mistakes on top, so Hard is the AI at full strength.
- **Online play:** each game is one document in Firebase Firestore, keyed by its room code. All players listen for live updates, and players sign in anonymously behind the scenes, so nobody needs an account.
- **Fair seating:** when two people join at the same moment, a Firestore transaction gives each seat a short lease so they can't both take the same one.
- **Security rules (`firestore.rules`):** only signed-in visitors can read or write games, and only at valid 4-letter room codes.
- **One source, two builds:** `artifact/build.js` combines the engine, AI, and interface into a single HTML page, then outputs a version for the website and a version that runs on claude.ai.

## Run It Locally

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/brandonchanfennimore/thornwood.git
cd thornwood
node artifact/build.js
```

Then open `web/index.html` in your browser. Solo play works right away. Online play needs Firebase set up (see below). Without it, the game still runs and hides the online options.

After you change anything in `public/` or `artifact/`, run `node artifact/build.js` again to rebuild `web/index.html`.

## Put It on the Web

The website version is the `web/` folder, hosted on Vercel and connected to Firebase.

1. In the [Firebase console](https://console.firebase.google.com), create a project and add a web app.
2. Under **Authentication**, turn on the **Anonymous** sign-in method.
3. Create a **Firestore** database, then paste the contents of `firestore.rules` into its **Rules** tab and publish.
4. Copy your web app's config into `web/firebase-config.js`. These values are meant to be public. The Firestore rules are what protect the data.
5. Deploy the `web/` folder to [Vercel](https://vercel.com) (or any static host).

## Project Structure

```
public/
  engine.js           Game rules, shared by every version
  ai.js               AI opponents
  index.html, client.js, style.css   Older self-hosted version
artifact/
  template.html       Page layout and styles
  app.js              Game interface: map, hand, panels, tutorial
  build.js            Builds web/index.html and the claude.ai version
web/
  index.html          Built website version (deploy this folder)
  firebase-config.js  Your Firebase settings
web-src/
  firebase-shim.js    Connects the website version to Firebase
firestore.rules       Database security rules
server.js             Older self-hosted Node server (npm start)
```

### Older Self-Hosted Version

`server.js` runs an earlier version of the game with a plainer interface on your own machine. Run `npm start` and open http://localhost:3000. Game rooms are kept in memory, so restarting the server ends any games in progress.

## License

MIT
