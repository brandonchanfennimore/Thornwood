// Online rooms in Firestore. Each game is one document, games/<CODE>, in the same shape the original site uses,
// so both versions share the database and the existing security rules. Players sign in anonymously.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getFirestore, onSnapshot, runTransaction, setDoc, type Firestore } from 'firebase/firestore';
import type { Action, Faction, Level, MapKey, State } from '../game/engine';
type MapChoice = MapKey | 'random';

// These values are meant to be public; the Firestore rules protect the data. Same project as web/firebase-config.js.
const config = {
  apiKey: 'AIzaSyC6vOgd2U_cTK2mK7UVRjKywcEuzYUzra8',
  authDomain: 'project-82981751-842a-4664-852.firebaseapp.com',
  projectId: 'project-82981751-842a-4664-852',
  storageBucket: 'project-82981751-842a-4664-852.firebasestorage.app',
  messagingSenderId: '946302267076',
  appId: '1:946302267076:web:af24e6b995bf29815da391',
};

export interface Seat { faction: Faction; type: 'human' | 'ai' | 'open'; uid?: string; name?: string; random?: boolean }
export interface Room {
  code: string; hostId: string; status: 'lobby' | 'playing'; rev: number; seats: Seat[];
  level?: Level; map?: MapChoice; gid?: string; state: State | null; last: { seq: number; f: Faction; a: Action } | null;
}

let ready: Promise<{ db: Firestore; uid: string }> | null = null;
export function connect() {
  ready ??= (async () => {
    const app = initializeApp(config);
    const cred = await signInAnonymously(getAuth(app));
    return { db: getFirestore(app), uid: cred.user.uid };
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

const clean = <T,>(d: T): T => JSON.parse(JSON.stringify(d)); // Firestore rejects undefined values
const friendly = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return new Error(code === 'permission-denied' ? 'The server refused that. Check the Firestore rules.' : code === 'unavailable' ? 'Could not reach the server. Check your connection.' : (e as Error)?.message || 'Something went wrong.');
};
const newCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

export async function createRoom(name: string): Promise<string> {
  const { db, uid } = await connect();
  const code = newCode();
  const room: Room = { code, hostId: uid, status: 'lobby', rev: 1, seats: [{ faction: 'badger', type: 'human', uid, name }, { faction: 'owl', type: 'ai' }], level: 'medium', map: 'autumn', state: null, last: null };
  try { await setDoc(doc(db, 'games', code), room); } catch (e) { throw friendly(e); }
  return code;
}

// Takes a seat inside a transaction, so two friends joining at the same moment can't get the same one.
export async function joinRoom(code: string, name: string, factions: Faction[]): Promise<void> {
  const { db, uid } = await connect();
  const ref = doc(db, 'games', code);
  try {
    await runTransaction(db, async t => {
      const snap = await t.get(ref);
      if (!snap.exists()) throw new Error('No game with that code.');
      const g = snap.data() as Room;
      if (g.seats.some(s => s.uid === uid)) return;
      if (g.status !== 'lobby') throw new Error('That game has already started.');
      let seat = g.seats.find(s => s.type === 'open');
      if (!seat) {
        if (g.seats.length >= 4) throw new Error('That game is full.');
        seat = { faction: factions.find(f => !g.seats.some(s => s.faction === f))!, type: 'open' };
        g.seats.push(seat);
      }
      Object.assign(seat, { type: 'human', uid, name });
      t.set(ref, clean({ ...g, rev: g.rev + 1 }));
    });
  } catch (e) { throw e instanceof Error && !(e as { code?: string }).code ? e : friendly(e); }
}

export async function watchRoom(code: string, onRoom: (r: Room | null) => void, onError: (e: Error) => void) {
  const { db } = await connect();
  return onSnapshot(doc(db, 'games', code), s => onRoom(s.exists() ? (s.data() as Room) : null), e => onError(friendly(e)));
}

export async function saveRoom(room: Room) {
  const { db } = await connect();
  try { await setDoc(doc(db, 'games', room.code), clean({ ...room, rev: (room.rev || 0) + 1 })); } catch (e) { throw friendly(e); }
}
