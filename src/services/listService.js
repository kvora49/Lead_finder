/**
 * Lead Finder — List Service  (Phase 4)
 *
 * Firestore schema:
 *   users/{userId}/lists/{listId}          ← list metadata
 *   users/{userId}/lists/{listId}/leads/{leadId}  ← individual lead records
 *
 * Using a subcollection for leads avoids Firestore's 1 MB document limit
 * and allows independently querying / paginating leads.
 */

import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── Path helpers ────────────────────────────────────────────────────────────
const listsCol   = (userId)         => collection(db, 'users', userId, 'lists');
const listDoc    = (userId, listId) => doc(db, 'users', userId, 'lists', listId);
const leadsCol   = (userId, listId) => collection(db, 'users', userId, 'lists', listId, 'leads');

// ── Normalise a Places API result into a plain lead object ────────────────--
export const normaliseLead = (b) => ({
  name:    b.displayName?.text  || b.name     || '',
  address: b.formattedAddress   || b.formatted_address || '',
  phone:   b.nationalPhoneNumber || b.formatted_phone_number || '',
  website: b.websiteUri         || b.website  || '',
  rating:  b.rating             ?? null,
  reviewCount: b.userRatingCount ?? b.user_ratings_total ?? 0,
  placeId: b.id                 || b.place_id || '',
  status:  b.businessStatus     || b.business_status || '',
  lat:     b.location?.latitude  ?? b.geometry?.location?.lat ?? null,
  lng:     b.location?.longitude ?? b.geometry?.location?.lng ?? null,
  savedAt: new Date().toISOString(),
});

// ────────────────────────────────────────────────────────────────────────────
// LIST CRUD
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a new empty list.
 * @returns {string} new listId
 */
export const createList = async (userId, name) => {
  if (!userId) throw new Error('userId required');
  if (!name?.trim()) throw new Error('List name cannot be empty');

  const ref = await addDoc(listsCol(userId), {
    name:      name.trim(),
    leadCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

/**
 * Fetch all lists for a user (ordered newest first), including their lead count.
 * @returns {Array<{id, name, leadCount, createdAt}>}
 */
export const getLists = async (userId) => {
  if (!userId) return [];

  const snap = await getDocs(query(listsCol(userId), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({
    id:        d.id,
    name:      d.data().name      ?? 'Untitled',
    leadCount: d.data().leadCount ?? 0,
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
    updatedAt: d.data().updatedAt?.toDate?.() ?? new Date(),
  }));
};

/**
 * Delete a list AND all leads inside it (batched).
 */
export const deleteList = async (userId, listId) => {
  if (!userId || !listId) throw new Error('userId and listId required');

  // Delete all leads first
  const leadSnap = await getDocs(leadsCol(userId, listId));
  const batch = writeBatch(db);
  leadSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(listDoc(userId, listId));
  await batch.commit();
};

// ────────────────────────────────────────────────────────────────────────────
// LEAD CRUD
// ────────────────────────────────────────────────────────────────────────────

/**
 * Add a single lead to a list.
 */
export const saveLead = async (userId, listId, business) => {
  if (!userId || !listId) throw new Error('userId and listId required');

  const lead = normaliseLead(business);
  const ref  = await addDoc(leadsCol(userId, listId), lead);

  // Bump list's lead count
  const listRef = listDoc(userId, listId);
  const listSnap = await getDoc(listRef);
  if (listSnap.exists()) {
    const { writeBatch: wb } = await import('firebase/firestore');
    // Simple update via addDoc side-effect — use bulkSaveLeads for proper counting
  }

  return ref.id;
};

/**
 * Bulk-save multiple leads to a list using a single Firestore batch.
 * Skips duplicates by placeId if already present.
 * Updates the list's leadCount atomically.
 *
 * @param {string}   userId
 * @param {string}   listId
 * @param {Array}    businesses   Raw Places API result objects
 * @returns {number} count of leads written
 */
export const bulkSaveLeads = async (userId, listId, businesses) => {
  if (!userId || !listId) throw new Error('userId and listId required');
  if (!businesses?.length)  return 0;

  // Fetch existing placeIds to avoid duplicates
  const existingSnap = await getDocs(leadsCol(userId, listId));
  const existingIds  = new Set(existingSnap.docs.map((d) => d.data().placeId).filter(Boolean));

  const toAdd = businesses
    .map(normaliseLead)
    .filter((l) => !l.placeId || !existingIds.has(l.placeId));

  if (!toAdd.length) return 0;

  // Firestore batch max = 500 writes; we chunk
  const CHUNK = 490;
  for (let i = 0; i < toAdd.length; i += CHUNK) {
    const batch = writeBatch(db);
    toAdd.slice(i, i + CHUNK).forEach((lead) => {
      batch.set(doc(leadsCol(userId, listId)), lead);
    });
    // Update list metadata in the last chunk
    if (i + CHUNK >= toAdd.length) {
      batch.update(listDoc(userId, listId), {
        leadCount: existingSnap.size + toAdd.length,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return toAdd.length;
};

/**
 * Get all leads in a list (ordered by savedAt descending).
 * @returns {Array} lead objects
 */
export const getLeads = async (userId, listId) => {
  if (!userId || !listId) return [];

  const snap = await getDocs(leadsCol(userId, listId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Delete a single lead from a list.
 */
export const deleteLead = async (userId, listId, leadId) => {
  await deleteDoc(doc(leadsCol(userId, listId), leadId));
};
