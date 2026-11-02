// Thornwood on the open web: provides the same small storage API the game uses on claude.ai,
// backed by Firebase (Firestore + anonymous sign-in). If no Firebase config is present,
// the game still runs in solo mode and simply hides online play.
(function () {
  const cfg = window.THORNWOOD_FIREBASE;
  let ready = null;
  function boot() {
    if (ready) return ready;
    ready = (async () => {
      if (!cfg || !cfg.apiKey || /PASTE/.test(cfg.apiKey) || !window.firebase) return null;
      firebase.initializeApp(cfg);
      const cred = await firebase.auth().signInAnonymously();
      return { fs: firebase.firestore(), uid: cred.user.uid };
    })().catch(e => { console.error('Online play is unavailable:', e); return null; });
    return ready;
  }
  const wrap = s => ({ id: s.id, exists: s.exists, data: () => s.data() });
  const err = e => ({ code: e && e.code === 'permission-denied' ? 'permission_denied' : (e && e.code) || 'unavailable', message: (e && e.message) || 'Something went wrong.' });
  const clean = d => JSON.parse(JSON.stringify(d)); // Firestore rejects undefined values

  function makeDb(fs) {
    return {
      doc(path) {
        const ref = fs.doc(path);
        return {
          set: d => ref.set(clean(d)).catch(e => { throw err(e); }),
          get: () => ref.get().then(wrap).catch(e => { throw err(e); }),
          onSnapshot: (next, onErr) => ref.onSnapshot(s => next(wrap(s)), e => onErr && onErr(err(e))),
          // short lease so two people joining at once don't take the same seat
          acquire: ({ holder, ttlMs = 30000 }) => fs.runTransaction(async t => {
            const s = await t.get(ref);
            if (!s.exists) return { acquired: true };
            const l = s.data()._lease, now = Date.now();
            if (l && l.until > now && l.holder !== holder) return { acquired: false };
            t.update(ref, { _lease: { holder, until: now + ttlMs } });
            return { acquired: true };
          }).catch(e => { throw err(e); }),
        };
      },
    };
  }
  window.claude = {
    use: async name => {
      const b = await boot();
      if (!b) return null;
      if (name === 'db') return makeDb(b.fs);
      if (name === 'user') return { id: async () => b.uid };
      return null;
    },
  };
})();
