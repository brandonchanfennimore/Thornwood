# Graph Report - thornwood  (2026-11-23)

## Corpus Check
- Large corpus: 170 files · ~1,648,187 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 517 nodes · 1130 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.81)
- Token cost: 76,472 input · 0 output

## Community Hubs (Navigation)
- React App Store and UI
- Map Art and 3D Board
- Game Engine Types and Text
- Legacy Vanilla UI (app.js)
- Build Script and Old Server
- App Dependencies
- Legacy Engine (engine.js)
- Single-file Web Build
- Engine API (TS)
- Old Self-hosted Client
- TypeScript Config
- Online Rooms and Hosting
- Core Game Rules
- Firebase Rooms (TS)
- Artifact Template and Styles
- Root Package Config
- Eight Factions
- Turn Phases and Guide
- AI Opponents
- Battle Dice

## God Nodes (most connected - your core abstractions)
1. `Web Build (index.html)` - 56 edges
2. `useGame` - 40 edges
3. `GameStore` - 22 edges
4. `Faction` - 21 edges
5. `Emblem()` - 20 edges
6. `EngineAPI` - 17 edges
7. `playStep()` - 17 edges
8. `App()` - 15 edges
9. `Board3D()` - 15 edges
10. `E` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Web Build (index.html)` --semantically_similar_to--> `claude.ai Artifact Build (thornwood.html)`  [INFERRED] [semantically similar]
  web/index.html → artifact/thornwood.html
- `Older Self-Hosted Page` --semantically_similar_to--> `Web Build (index.html)`  [INFERRED] [semantically similar]
  public/index.html → web/index.html
- `app/index.html (React/Vite entry)` --conceptually_related_to--> `Web Build (index.html)`  [AMBIGUOUS]
  app/index.html → web/index.html
- `Web Build (index.html)` --references--> `Vercel Hosting`  [EXTRACTED]
  web/index.html → README.md
- `Web Build (index.html)` --implements--> `Artifact Template Page`  [INFERRED]
  web/index.html → artifact/template.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Single-file build pipeline** — artifact_build, artifact_template_page, artifact_template_engine_slot, artifact_template_ai_slot, artifact_template_app_slot, web_index_page, artifact_thornwood_page [INFERRED 0.95]
- **Online room flow** — web_index_boot, web_index_makedb, web_index_openroom, web_index_joinroom, web_index_seatop, web_index_receive, readme_firestore [INFERRED 0.85]
- **AI turn decision flow** — web_index_kickai, web_index_chooseaction, web_index_listactions, web_index_scoreaction, web_index_doact [INFERRED 0.85]

## Communities (23 total, 4 thin omitted)

### Community 0 - "React App Store and UI"
Cohesion: 0.09
Nodes (38): App(), Battle, Level, MAP, GameStore, isHost(), useGame, Board() (+30 more)

### Community 1 - "Map Art and 3D Board"
Cohesion: 0.06
Nodes (49): curve(), EDGE, MAP_H, MAP_W, MAP_X, MAP_Y, Palette, PALETTES (+41 more)

### Community 2 - "Game Engine Types and Text"
Cohesion: 0.07
Nodes (48): boardBg(), Token, Action, AI, Card, CardType, E, Faction (+40 more)

### Community 3 - "Legacy Vanilla UI (app.js)"
Cohesion: 0.10
Nodes (51): applyStyle(), banner(), bigCard(), buildTutorial(), cardEl(), clickRegion(), curve(), dayBanner() (+43 more)

### Community 4 - "Build Script and Old Server"
Cohesion: 0.05
Nodes (30): ai, app, art, engine, fs, p, root, tpl (+22 more)

### Community 5 - "App Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, firebase, @floating-ui/react, motion, react, react-dom, three, zustand (+26 more)

### Community 6 - "Legacy Engine (engine.js)"
Cohesion: 0.16
Nodes (27): apply(), battle(), buildDeck(), canPay(), chorus(), costCard(), draw(), endTurn() (+19 more)

### Community 7 - "Single-file Web Build"
Cohesion: 0.12
Nodes (21): /src/main.tsx entry module, app/index.html (React/Vite entry), buildDeck(), endTurn(), flyPieces(), newGame(), nextTurn(), Web Build (index.html) (+13 more)

### Community 9 - "Old Self-hosted Client"
Cohesion: 0.30
Nodes (13): btn(), connect(), doAct(), enter(), get(), post(), regionActs(), render() (+5 more)

### Community 10 - "TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, allowJs, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+5 more)

### Community 11 - "Online Rooms and Hosting"
Cohesion: 0.21
Nodes (12): window.claude.use db/user storage, claude.ai Artifact Build (thornwood.html), Anonymous Sign-in, Firebase Firestore, Firestore Security Rules, Online Multiplayer Rooms, Vercel Hosting, boot() (+4 more)

### Community 12 - "Core Game Rules"
Cohesion: 0.15
Nodes (9): Cards and Ambush, Thornwood Game, Built-in Tutorial, buildTutorial(), drawTerrain(), openTutorial(), renderBoard(), renderTut() (+1 more)

### Community 13 - "Firebase Rooms (TS)"
Cohesion: 0.33
Nodes (11): net(), clean(), config, connect(), createRoom(), friendly(), joinRoom(), MapChoice (+3 more)

### Community 14 - "Artifact Template and Styles"
Cohesion: 0.18
Nodes (9): /*AI*/ placeholder, /*APP*/ placeholder, /*ENGINE*/ placeholder, Artifact Template Page, 3D View (three.js), Visual Styles (Simple/Artistic/3D), applyStyle(), init3D() (+1 more)

### Community 15 - "Root Package Config"
Cohesion: 0.17
Nodes (11): description, engines, node, license, main, name, scripts, build (+3 more)

### Community 16 - "Eight Factions"
Cohesion: 0.20
Nodes (10): 8 Asymmetric Factions, Badger Clans, Fox Raiders, Frog Chorus, Hedgehog Hollows, Mole Delvers, Otter Company, Owl Parliament (+2 more)

### Community 17 - "Turn Phases and Guide"
Cohesion: 0.22
Nodes (8): CARDS, DRAW1, DUSK_END, FactionGuide, FIGHT, MOVE, PHASES, Step

### Community 18 - "AI Opponents"
Cohesion: 0.25
Nodes (8): canPay(), chooseAction(), doAct(), kickAI(), listActions(), pay(), save(), scoreAction()

### Community 19 - "Battle Dice"
Cohesion: 0.40
Nodes (4): battle(), dice(), removeHits(), showBattle()

## Ambiguous Edges - Review These
- `app/index.html (React/Vite entry)` → `Web Build (index.html)`  [AMBIGUOUS]
  app/index.html · relation: conceptually_related_to

## Knowledge Gaps
- **118 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+113 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 172 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `app/index.html (React/Vite entry)` and `Web Build (index.html)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Web Build (index.html)` connect `Single-file Web Build` to `Build Script and Old Server`, `Legacy Engine (engine.js)`, `Online Rooms and Hosting`, `Core Game Rules`, `Artifact Template and Styles`, `Eight Factions`, `AI Opponents`, `Battle Dice`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Web Build (index.html)` (e.g. with `Older Self-Hosted Page` and `Artifact Template Page`) actually correct?**
  _`Web Build (index.html)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _118 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `React App Store and UI` be split into smaller, more focused modules?**
  _Cohesion score 0.09472606246799795 - nodes in this community are weakly interconnected._
- **Why does `EngineAPI` connect `Engine API (TS)` to `Game Engine Types and Text`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `Map Art and 3D Board` be split into smaller, more focused modules?**
  _Cohesion score 0.06487434248977206 - nodes in this community are weakly interconnected._