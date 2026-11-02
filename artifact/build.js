// Builds both versions of the single-page game:
//   artifact/thornwood.html  — published on claude.ai (uses claude.ai's shared storage)
//   web/index.html           — your own website (uses Firebase; config in web/firebase-config.js)
// Run: node artifact/build.js
const fs = require('fs'), p = require('path');
const root = p.join(__dirname, '..');
const r = f => fs.readFileSync(p.join(root, f), 'utf8');

const engine = r('public/engine.js'), ai = r('public/ai.js'), app = r('artifact/app.js');
const fill = (html, appSrc) => html.replace('/*ENGINE*/', () => engine).replace('/*AI*/', () => ai).replace('/*APP*/', () => appSrc);

// claude.ai artifact
const tpl = r('artifact/template.html');
const art = fill(tpl, app);
fs.writeFileSync(p.join(root, 'artifact/thornwood.html'), art);
console.log('wrote artifact/thornwood.html', art.length, 'bytes');

// website
const swap = (s, pairs) => pairs.reduce((acc, [a, b]) => { if (!acc.includes(a)) throw new Error('build: text not found: ' + a.slice(0, 60)); return acc.split(a).join(b); }, s);
const webApp = swap(app, [
  ["'Online play needs this page opened in Claude while signed in.'", "'Online play is not set up on this site yet.'"],
  ["e.code === 'invalid_argument' ? 'You can only view this page, so you can\\'t create games. Ask the owner for Contributor access.'", "e.code === 'permission_denied' ? 'The game database refused this. Check the Firestore security rules.'"],
  ["e.code === 'invalid_argument' ? 'You can only view this page, so you can\\'t join. Ask the owner for Contributor access.'", "e.code === 'permission_denied' ? 'The game database refused this. Check the Firestore security rules.'"],
]);
let webTpl = swap(tpl, [
  ["Online play turns on when this page is opened in Claude while you're signed in.", 'Online play is not set up on this site yet. Add your Firebase settings to firebase-config.js.'],
  ['Friends open this page and enter the code. To join, they need Contributor access to this page or higher, which you set in the Share menu. Set empty seats to AI or remove them.', 'Friends open this website and enter the code. Set empty seats to AI or remove them.'],
]);
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Thornwood: a woodland war game for 2–4 players. Badgers, rabbits, owls and otters each play by their own rules.">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="${FB}firebase-app-compat.js"></script>
<script src="${FB}firebase-auth-compat.js"></script>
<script src="${FB}firebase-firestore-compat.js"></script>
<script src="firebase-config.js"></script>
<script>
${r('web-src/firebase-shim.js')}
</script>
</head>
<body>
`;
const web = head + fill(webTpl, webApp) + '\n</body>\n</html>\n';
fs.mkdirSync(p.join(root, 'web'), { recursive: true });
fs.writeFileSync(p.join(root, 'web/index.html'), web);
console.log('wrote web/index.html', web.length, 'bytes');
