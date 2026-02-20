/**
 * Add Credits to a User  (Phase 3 admin utility)
 *
 * Run from the project root:
 *   node scripts/addCredits.js
 *
 * Change the USER_EMAIL and CREDITS_TO_ADD constants below before running.
 */

import { initializeApp }    from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            'AIzaSyCRPZg4iK4TdNvQxUK4x3jc8q37Jd58MmI',
  authDomain:        'lead-finder-6b009.firebaseapp.com',
  projectId:         'lead-finder-6b009',
  storageBucket:     'lead-finder-6b009.firebasestorage.app',
  messagingSenderId: '1020136892036',
  appId:             '1:1020136892036:web:a55cb272c8b40ab36c04d1',
};

// ─── CONFIGURE THESE ──────────────────────────────────────────────────────────
const USER_EMAIL      = 'your@email.com';   // ← change to the user's email
const CREDITS_TO_ADD  = 200;                // ← how many credits to add
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

async function addCredits() {
  console.log(`\n[addCredits] Looking up user: ${USER_EMAIL}`);

  // Find the user document by email
  const q    = query(collection(db, 'users'), where('email', '==', USER_EMAIL));
  const snap = await getDocs(q);

  if (snap.empty) {
    console.error(`❌  No user found with email "${USER_EMAIL}".`);
    console.error('    Make sure they have logged in at least once so their Firestore doc exists.');
    process.exit(1);
  }

  const userDoc  = snap.docs[0];
  const userData = userDoc.data();
  const before   = userData.credits ?? 0;
  const after    = before + CREDITS_TO_ADD;

  console.log(`   UID:     ${userDoc.id}`);
  console.log(`   Credits: ${before} → ${after}`);

  await updateDoc(doc(db, 'users', userDoc.id), { credits: after });

  console.log(`✅  Done! ${USER_EMAIL} now has ${after} credits.\n`);
  process.exit(0);
}

addCredits().catch((err) => {
  console.error('❌  Script failed:', err.message);
  process.exit(1);
});
