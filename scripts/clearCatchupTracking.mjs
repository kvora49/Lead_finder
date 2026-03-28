import admin from 'firebase-admin';
import fs from 'fs';

const svc = JSON.parse(fs.readFileSync('./lead-finder-6b009-firebase-adminsdk-fbsvc-e44143234f.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(svc) });
}

const db = admin.firestore();
const now = new Date();
const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const settingsSnap = await db.doc('systemConfig/globalSettings').get();
const settings = settingsSnap.exists ? settingsSnap.data() : {};
const rawThreshold = Number.parseInt(settings.creditAlertThreshold, 10);
const thresholdPct = Number.isFinite(rawThreshold)
  ? Math.min(Math.max(rawThreshold, 1), 100)
  : 80;

const snap = await db
  .collection('credit_alert_tracking')
  .where('monthKey', '==', monthKey)
  .where('thresholdPct', '==', thresholdPct)
  .where('source', '==', 'catchup-manual')
  .get();

let deleted = 0;
let batch = db.batch();
let batchCount = 0;
for (const d of snap.docs) {
  batch.delete(d.ref);
  deleted++;
  batchCount++;
  if (batchCount >= 400) {
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  }
}
if (batchCount > 0) {
  await batch.commit();
}

console.log(JSON.stringify({ monthKey, thresholdPct, deleted }, null, 2));
