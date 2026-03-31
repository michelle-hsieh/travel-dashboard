import { doc, setDoc, getDoc, collection, getDocs, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from './database';
import { firestore } from '../firebase';
import { exportTrip } from '../utils/export';
import { v4 as uuidv4 } from 'uuid';
import type { Trip, Day, Place, Note, Flight, Hotel, Ticket, ChecklistItem, BudgetItem, Resource } from '../types';

function normalizeEmail(email: string): string {
  const lower = email.toLowerCase().trim();
  const [localRaw, domainRaw = ''] = lower.split('@');
  const domain = domainRaw === 'googlemail.com' ? 'gmail.com' : domainRaw;
  const localNoPlus = localRaw.split('+')[0];
  const localNoDots = domain === 'gmail.com' ? localNoPlus.replace(/\./g, '') : localNoPlus;
  return `${localNoDots}@${domain}`;
}

/**
 * Push a single trip from Dexie to Firestore.
 * This excludes blob attachments to prevent exceeding the 1MB Firestore document limit.
 */
export async function pushTripToCloud(localTripId: number, adminUid: string, userEmail: string) {
  const trip = await db.trips.get(localTripId);
  if (!trip) throw new Error('Trip not found locally.');

  // Assign Firebase ID and Admin UID if not present
  let needsUpdate = false;
  let updates = {};
  if (!trip.firebaseId) {
    trip.firebaseId = uuidv4();
    updates = { ...updates, firebaseId: trip.firebaseId };
    needsUpdate = true;
  }
  if (!trip.adminUid && adminUid) {
    trip.adminUid = adminUid;
    updates = { ...updates, adminUid };
    needsUpdate = true;
  }
  if (!trip.adminEmail && userEmail) {
    trip.adminEmail = userEmail.toLowerCase();
    updates = { ...updates, adminEmail: trip.adminEmail };
    needsUpdate = true;
  }
  if (!trip.collaborators) {
    trip.collaborators = {};
    updates = { ...updates, collaborators: {} };
    needsUpdate = true;
  }

  if (needsUpdate) {
    await db.trips.update(localTripId, updates);
  }

  const tripExport = await exportTrip(localTripId);

  // Merge server collaborators (if any) to avoid losing them, and build member email arrays
  let serverCollabs: Record<string, any> = {};
  let remoteTripExists = false;
  try {
    if (trip.firebaseId) {
      const existingDoc = await getDoc(doc(firestore, 'trips', trip.firebaseId));
      if (existingDoc.exists()) {
        remoteTripExists = true;
        serverCollabs = existingDoc.data().collaborators ?? {};
      }
    }
  } catch {
    // ignore fetch errors (offline, etc.)
  }

  const mergedCollabs: Record<string, any> = { ...serverCollabs };
  Object.values(trip.collaborators || {}).forEach((c: any) => {
    const normEmail = normalizeEmail(c.email);
    const key = normEmail.replace(/\./g, '_');
    mergedCollabs[key] = { ...c, email: normEmail };
  });

  const memberEmails = Object.values(mergedCollabs).map((c: any) => normalizeEmail(c.email));

  // We write to subcollections to enable Firestore security rules to protect specific tabs (e.g. checklist)
  const tripDocPayload = {
    ...tripExport.trip,
    collaborators: mergedCollabs,
    memberEmails,
    collaboratorEmails: memberEmails,
    daysCount: tripExport.days?.length || 0,
    placesCount: tripExport.places?.length || 0,
    lastSyncedAt: Date.now(),
    adminEmail: (trip.adminEmail ?? userEmail).toLowerCase(),
  };

  const batch = writeBatch(firestore);
  const tripRef = doc(firestore, 'trips', trip.firebaseId as string);

  // Clear old subcollection docs to avoid duplicates from changing local IDs
  const clearSub = async (sub: string) => {
    const snap = await getDocs(collection(tripRef, sub));
    snap.forEach((d) => batch.delete(d.ref));
  };

  if (remoteTripExists) {
    await clearSub('days');
    await clearSub('places');
    await clearSub('notes');
    await clearSub('flights');
    await clearSub('hotels');
    await clearSub('tickets');
    await clearSub('checklistItems');
    await clearSub('budgetItems');
    await clearSub('resources');
  }

  batch.set(tripRef, tripDocPayload);

  // Helper macro to batch set arrays into subcollections
  const addSub = (arr: any[], subName: string) => {
    (arr || []).forEach(item => {
      // Use the local numeric ID as string for the document ID so we can overwrite cleanly
      const docRef = doc(firestore, 'trips', trip.firebaseId as string, subName, String(item.id));
      batch.set(docRef, item);
    });
  };

  addSub(tripExport.days, 'days');
  addSub(tripExport.places, 'places');
  addSub(tripExport.notes, 'notes');
  addSub(tripExport.flights, 'flights');
  addSub(tripExport.hotels, 'hotels');
  addSub(tripExport.tickets, 'tickets');
  addSub(tripExport.checklistItems, 'checklistItems');
  addSub(tripExport.budgetItems, 'budgetItems');
  addSub(tripExport.resources || [], 'resources');

  await batch.commit();

  // Cleanup legacy duplicate docs written by the old realtime sync path
  // which used local Dexie IDs as Firestore doc IDs.
  try {
    const adminTripsSnap = await getDocs(query(collection(firestore, 'trips'), where('adminUid', '==', adminUid)));
    const duplicateDocs = adminTripsSnap.docs.filter((d) => {
      if (d.id === trip.firebaseId) return false;
      const data = d.data() as any;
      return data?.name === trip.name && data?.createdAt === trip.createdAt;
    });

    for (const duplicateDoc of duplicateDocs) {
      await deleteDoc(duplicateDoc.ref);
    }
  } catch (e) {
    console.warn('Failed to clean legacy duplicate trip docs:', e);
  }

  return trip.firebaseId;
}

/**
 * Fetches trips for the current user from Firestore and merges them into Dexie.
 * It will overwrite local data for the trips if they already exist.
 */
export async function pullTripsFromCloud(userUid: string, userEmail: string) {
  const tripsRef = collection(firestore, 'trips');
  const userEmailNorm = normalizeEmail(userEmail);
  const findCollab = (collabs: Record<string, any> | undefined, emailNorm: string) => {
    if (!collabs) return undefined;
    const direct = collabs[emailNorm.replace(/\./g, '_')];
    if (direct) return direct;
    return Object.values(collabs).find((c: any) => normalizeEmail((c as any).email) === emailNorm);
  };

  // 1. Get trips where user is admin
  const qAdmin = query(tripsRef, where('adminUid', '==', userUid));
  const adminSnap = await getDocs(qAdmin);

  // 2. Get trips where user is a collaborator
  const qMember = query(tripsRef, where('memberEmails', 'array-contains', normalizeEmail(userEmail)));
  const memberSnap = await getDocs(qMember);

  // Merge unique trips
  const fetchedDocs = new Map<string, any>();
  adminSnap.docs.forEach(doc => fetchedDocs.set(doc.id, { id: doc.id, data: doc.data() }));
  memberSnap.docs.forEach(doc => fetchedDocs.set(doc.id, { id: doc.id, data: doc.data() }));

  const cloudTripsData = Array.from(fetchedDocs.values());
  const fetchedIds = new Set(cloudTripsData.map((d) => (d.data.firebaseId ?? d.id)));

  // Prune local trips that were deleted in Firestore (only those already linked with firebaseId)
  const staleLocal = await db.trips
    .filter((t) => !!t.firebaseId && !fetchedIds.has(t.firebaseId!))
    .toArray();
  for (const stale of staleLocal) {
    await deleteLocalTripCascade(stale.id!);
  }

  for (const entry of cloudTripsData) {
    const cloudData = entry.data;
    const docId = entry.id;
    const effectiveId = cloudData.firebaseId ?? docId;
    if (!effectiveId) continue;

    const isAdmin = cloudData.adminUid === userUid;
    const collab = findCollab(cloudData.collaborators, userEmailNorm);

    const allowPlanner = !!(isAdmin || collab?.permissions?.planner === 'read' || collab?.permissions?.planner === 'write');
    const allowFlights = !!(isAdmin || collab?.permissions?.flights === 'read' || collab?.permissions?.flights === 'write');
    const allowHotels = !!(isAdmin || collab?.permissions?.hotels === 'read' || collab?.permissions?.hotels === 'write');
    const allowTickets = !!(isAdmin || collab?.permissions?.tickets === 'read' || collab?.permissions?.tickets === 'write');
    const allowResources = !!(isAdmin || collab?.permissions?.resources === 'read' || collab?.permissions?.resources === 'write');
    const allowChecklist = !!isAdmin; // collaborators never
    const allowBudget = !!(isAdmin || !!collab);

    // Find or create a stable local trip ID, then refresh in-place to avoid duplicate records
    let existing = await db.trips.where('firebaseId').equals(effectiveId).first();
    // Fallback: match by name (and adminUid if available) to avoid duplicate local trips when firebaseId was not set previously
    if (!existing) {
      existing = await db.trips
        .filter((t) => t.name === cloudData.name && (!!cloudData.adminUid ? t.adminUid === cloudData.adminUid : true))
        .first();
      if (existing?.id) {
        await db.trips.update(existing.id, { firebaseId: effectiveId, adminUid: cloudData.adminUid, adminEmail: cloudData.adminEmail });
      }
    }
    let localTripId: number;

    if (existing?.id) {
      localTripId = existing.id;
    } else {
      const { id: _remoteId, ...rest } = cloudData as Trip;
      localTripId = (await db.trips.add({ ...rest, firebaseId: effectiveId } as Trip)) as number;
    }

    await refreshTripFromCloud(localTripId, effectiveId, userEmail, isAdmin);
  }
}

/**
 * Refresh a single local trip (by local ID) from Firestore using its firebaseId.
 * Keeps the existing local trip ID to avoid breaking references in the UI.
 */
export async function refreshTripFromCloud(localTripId: number, firebaseId: string, currentUserEmail?: string, isAdminOverride?: boolean) {
  const tripRef = doc(firestore, 'trips', firebaseId);
  const snap = await getDoc(tripRef);
  if (!snap.exists()) {
    // Trip removed from Firestore -> clean local copy
    await deleteLocalTripCascade(localTripId);
    return;
  }
  const tripData = snap.data() as Trip;
  const emailNorm = currentUserEmail ? normalizeEmail(currentUserEmail) : '';
  const findCollab = (collabs: Record<string, any> | undefined, norm: string) => {
    if (!collabs || !norm) return undefined;
    const direct = collabs[norm.replace(/\./g, '_')];
    if (direct) return direct;
    return Object.values(collabs).find((c: any) => normalizeEmail((c as any).email) === norm);
  };
  const collab = findCollab((tripData as any).collaborators, emailNorm);
  const isAdmin = !!isAdminOverride || (!!emailNorm && tripData.adminEmail && normalizeEmail(tripData.adminEmail) === emailNorm);

  const allowPlanner = !!(isAdmin || collab?.permissions?.planner === 'read' || collab?.permissions?.planner === 'write');
  const allowFlights = !!(isAdmin || collab?.permissions?.flights === 'read' || collab?.permissions?.flights === 'write');
  const allowHotels = !!(isAdmin || collab?.permissions?.hotels === 'read' || collab?.permissions?.hotels === 'write');
  const allowTickets = !!(isAdmin || collab?.permissions?.tickets === 'read' || collab?.permissions?.tickets === 'write');
  const allowResources = !!(isAdmin || collab?.permissions?.resources === 'read' || collab?.permissions?.resources === 'write');
  const allowChecklist = !!isAdmin;
  const allowBudget = !!(isAdmin || !!collab);

  const getSub = async (sub: string, allowed: boolean) => {
    if (!allowed) return null;
    try {
      const subSnap = await getDocs(collection(tripRef, sub));
      return subSnap.docs.map((d) => d.data());
    } catch (e) {
      console.warn(
        `Could not fetch subcollection ${sub}. This is usually a Firestore rules mismatch between the collaborator entry key stored on the trip doc and the signed-in user's normalized email.`,
        e
      );
      return null;
    }
  };

  const [
    days,
    places,
    notes,
    flights,
    hotels,
    tickets,
    checklistItems,
    budgetItems,
    resources,
  ] = await Promise.all([
    getSub('days', allowPlanner),
    getSub('places', allowPlanner),
    getSub('notes', allowPlanner),
    getSub('flights', allowFlights),
    getSub('hotels', allowHotels),
    getSub('tickets', allowTickets),
    getSub('checklistItems', allowChecklist),
    getSub('budgetItems', allowBudget),
    getSub('resources', allowResources),
  ]);

  // If planner basics are not readable, abort to avoid wiping local data
  if (days === null || places === null) return;

  await db.transaction(
    'rw',
    [
      db.trips,
      db.days,
      db.places,
      db.notes,
      db.attachments,
      db.flights,
      db.hotels,
      db.tickets,
      db.checklistItems,
      db.budgetItems,
      db.resources,
    ],
    async () => {
      const placeIds = (await db.places.where('tripId').equals(localTripId).toArray()).map((p) => p.id!);
      if (placeIds.length) {
        await db.notes.where('placeId').anyOf(placeIds).delete();
        await db.attachments
          .filter((a) => a.parentType === 'place' && placeIds.includes(a.parentId))
          .delete();
      }
      await db.places.where('tripId').equals(localTripId).delete();
      await db.days.where('tripId').equals(localTripId).delete();
      await db.flights.where('tripId').equals(localTripId).delete();
      await db.hotels.where('tripId').equals(localTripId).delete();
      await db.tickets.where('tripId').equals(localTripId).delete();
      await db.checklistItems.where('tripId').equals(localTripId).delete();
      await db.budgetItems.where('tripId').equals(localTripId).delete();
      await db.resources.where('tripId').equals(localTripId).delete();

      const dayMap = new Map<number, number>();
      for (const d of (days ?? []) as any[]) {
        const { id: oldId, ...rest } = d;
        const newId = await db.days.add({ ...rest, tripId: localTripId } as Day);
        if (oldId != null) dayMap.set(oldId, newId as number);
      }

      const placeMap = new Map<number, number>();
      for (const p of (places ?? []) as any[]) {
        const { id: oldId, dayId, ...rest } = p;
        const newDayId = dayMap.get(dayId) ?? dayId;
        const newId = await db.places.add({ ...rest, tripId: localTripId, dayId: newDayId } as Place);
        if (oldId != null) placeMap.set(oldId, newId as number);
      }

      for (const n of (notes ?? []) as any[]) {
        const { id: _oldId, placeId, ...rest } = n;
        const newPlaceId = placeMap.get(placeId) ?? placeId;
        await db.notes.add({ ...rest, placeId: newPlaceId } as Note);
      }

      for (const f of (flights ?? []) as any[]) {
        const { id: _oldId, ...rest } = f;
        await db.flights.add({ ...rest, tripId: localTripId } as Flight);
      }
      for (const h of (hotels ?? []) as any[]) {
        const { id: _oldId, ...rest } = h;
        await db.hotels.add({ ...rest, tripId: localTripId } as Hotel);
      }
      for (const t of (tickets ?? []) as any[]) {
        const { id: _oldId, ...rest } = t;
        await db.tickets.add({ ...rest, tripId: localTripId } as Ticket);
      }
      for (const c of (checklistItems ?? []) as any[]) {
        const { id: _oldId, ...rest } = c;
        await db.checklistItems.add({ ...rest, tripId: localTripId } as ChecklistItem);
      }
      for (const b of (budgetItems ?? []) as any[]) {
        const { id: _oldId, ...rest } = b;
        await db.budgetItems.add({ ...rest, tripId: localTripId } as BudgetItem);
      }
      for (const r of (resources ?? []) as any[]) {
        const { id: _oldId, ...rest } = r;
        await db.resources.add({ ...rest, tripId: localTripId } as Resource);
      }

      await db.trips.update(localTripId, {
        name: tripData.name,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        adminUid: tripData.adminUid,
        adminEmail: tripData.adminEmail,
        firebaseId,
        collaborators: (tripData as any).collaborators ?? {},
        collaboratorEmails: (tripData as any).collaboratorEmails ?? [],
        memberEmails: (tripData as any).memberEmails ?? [],
        daysCount: (days ?? []).length,
        placesCount: (places ?? []).length,
      });
    }
  );
}

// Remove a trip and all related local data
async function deleteLocalTripCascade(localTripId: number) {
  await db.transaction(
    'rw',
    [db.trips, db.days, db.places, db.notes, db.attachments, db.flights, db.hotels, db.tickets, db.checklistItems, db.budgetItems, db.resources],
    async () => {
      const placeIds = (await db.places.where('tripId').equals(localTripId).toArray()).map((p) => p.id!);
      if (placeIds.length) {
        await db.notes.where('placeId').anyOf(placeIds).delete();
        await db.attachments
          .filter((a) => a.parentType === 'place' && placeIds.includes(a.parentId))
          .delete();
      }
      await db.places.where('tripId').equals(localTripId).delete();
      await db.days.where('tripId').equals(localTripId).delete();
      await db.flights.where('tripId').equals(localTripId).delete();
      await db.hotels.where('tripId').equals(localTripId).delete();
      await db.tickets.where('tripId').equals(localTripId).delete();
      await db.checklistItems.where('tripId').equals(localTripId).delete();
      await db.budgetItems.where('tripId').equals(localTripId).delete();
      await db.resources.where('tripId').equals(localTripId).delete();
      await db.trips.delete(localTripId);
    }
  );
}

/**
 * Fetches public trip summaries for guests.
 */
export async function pullPublicTripsFromCloud() {
  const tripsRef = collection(firestore, 'trips');
  const snap = await getDocs(tripsRef); // Allowed by `match /trips/{tripId} { allow read: if true; }`
  
  // We don't import them into Dexie! We just return them for the UI to display.
  // Guests only see the name, we shouldn't wipe their local Dexie or try to insert them 
  // without subcollections, because inserting partial trips breaks relationships.
  return snap.docs.map(doc => {
    const data = doc.data() as Trip;
    // VERY IMPORTANT: Strip the 'id' property so the UI knows this is a cloud-only trip!
    // Otherwise the UI will try to query the local Dexie DB with the creator's local ID.
    const { id, ...rest } = data;
    return rest as Trip;
  });
}
