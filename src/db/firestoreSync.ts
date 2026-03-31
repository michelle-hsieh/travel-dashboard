import { doc, setDoc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { firestore } from '../firebase';
import { db } from './database';
import type { Day, Place, Note, Flight, Hotel, Ticket, ChecklistItem, BudgetItem, Resource } from '../types';
import { normalizeEmail } from '../utils/emails';


/**
 * Firestore sync strategy:
 * - Each trip is stored as a SINGLE Firestore document (trips/{tripId})
 * - Contains trip metadata + all related data as nested arrays
 * - Admin uploads from Dexie -> Firestore
 * - Members download from Firestore -> Dexie (with ID remapping)
 * - Keeps well under Firestore's 1MB doc limit for typical travel data
 */

export interface FirestoreTripDoc {
  name: string;
  startDate: string;
  endDate: string;
  createdAt: number;
  adminUid: string;
  adminEmail: string;
  collaborators?: Record<string, { email: string; permissions: Record<string, string> }>;
  collaboratorEmails?: string[];
  // Nested trip data
  days: Day[];
  places: Place[];
  notes: Note[];
  flights: Flight[];
  hotels: Hotel[];
  tickets: Ticket[];
  checklistItems: ChecklistItem[];
  budgetItems: BudgetItem[];
  resources: Resource[];
  // Sync metadata
  _lastSyncedAt: number;
}

// --- Admin: Upload local Dexie data to Firestore ---

export async function uploadTripToFirestore(
  tripId: number,
  adminUid: string,
  adminEmail: string
): Promise<void> {
  const trip = await db.trips.get(tripId);
  if (!trip) return;

  const days = await db.days.where('tripId').equals(tripId).toArray();
  const places = await db.places.where('tripId').equals(tripId).toArray();
  const placeIds = places.map(p => p.id!);
  const notes = placeIds.length > 0
    ? await db.notes.where('placeId').anyOf(placeIds).toArray()
    : [];
  const flights = await db.flights.where('tripId').equals(tripId).toArray();
  const hotels = await db.hotels.where('tripId').equals(tripId).toArray();
  const tickets = await db.tickets.where('tripId').equals(tripId).toArray();
  const checklistItems = await db.checklistItems.where('tripId').equals(tripId).toArray();
  const budgetItems = await db.budgetItems.where('tripId').equals(tripId).toArray();
  const resources = await db.resources.where('tripId').equals(tripId).toArray();

  const tripDocRef = doc(firestore, 'trips', String(tripId));

  // Preserve existing collaborators from Firestore
  let existingCollaborators: Record<string, any> = {};
  let existingCollaboratorEmails: string[] = [];
  try {
    const existing = await getDoc(tripDocRef);
    if (existing.exists()) {
      const data = existing.data();
      existingCollaborators = data.collaborators ?? {};
      existingCollaboratorEmails = data.collaboratorEmails ?? [];
    }
  } catch {
    // ignore
  }

  // Merge with local collaborators and rebuild collaboratorEmails
  const mergedCollabs: Record<string, any> = { ...existingCollaborators };
  if (trip.collaborators) {
    Object.values(trip.collaborators).forEach((c: any) => {
      const normEmail = normalizeEmail(c.email);
      const key = normEmail.replace(/\./g, '_');
      mergedCollabs[key] = { ...c, email: normEmail };
    });
  }
  const collabEmails = Object.values(mergedCollabs).map((c: any) => normalizeEmail(c.email));

  const tripDoc: FirestoreTripDoc = {
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    createdAt: trip.createdAt,
    adminUid,
    adminEmail,
    collaborators: mergedCollabs as FirestoreTripDoc['collaborators'],
    collaboratorEmails: collabEmails.length ? collabEmails : existingCollaboratorEmails,
    days,
    places,
    notes,
    flights,
    hotels,
    tickets,
    checklistItems,
    budgetItems,
    resources,
    _lastSyncedAt: Date.now(),
  };

  await setDoc(tripDocRef, tripDoc);
}

// --- Member/Guest: Download Firestore data into local Dexie ---

let _importing = false;

export async function importTripFromFirestore(
  firestoreData: FirestoreTripDoc,
  localTripId: number
): Promise<void> {
  if (_importing) return;
  _importing = true;

  try {
    // 1. Clear existing local data for this trip
    await clearLocalTripData(localTripId);

    // 2. Update trip record
    await db.trips.update(localTripId, {
      name: firestoreData.name,
      startDate: firestoreData.startDate,
      endDate: firestoreData.endDate,
    });

    // 3. Import days with ID remapping
    const dayIdMap = new Map<number, number>();
    for (const day of firestoreData.days ?? []) {
      const { id: oldId, ...rest } = day;
      const newId = await db.days.add({ ...rest, tripId: localTripId } as Day);
      if (oldId != null) dayIdMap.set(oldId, newId as number);
    }

    // 4. Import places with day ID remapping
    const placeIdMap = new Map<number, number>();
    for (const place of firestoreData.places ?? []) {
      const { id: oldId, ...rest } = place;
      const newDayId = dayIdMap.get(rest.dayId) ?? rest.dayId;
      const newId = await db.places.add({ ...rest, tripId: localTripId, dayId: newDayId } as Place);
      if (oldId != null) placeIdMap.set(oldId, newId as number);
    }

    // 5. Import notes with place ID remapping
    for (const note of firestoreData.notes ?? []) {
      const { id: _, ...rest } = note;
      const newPlaceId = placeIdMap.get(rest.placeId) ?? rest.placeId;
      await db.notes.add({ ...rest, placeId: newPlaceId } as Note);
    }

    // 6. Import flat collections
    for (const f of firestoreData.flights ?? []) {
      const { id: _, ...rest } = f;
      await db.flights.add({ ...rest, tripId: localTripId } as Flight);
    }
    for (const h of firestoreData.hotels ?? []) {
      const { id: _, ...rest } = h;
      await db.hotels.add({ ...rest, tripId: localTripId } as Hotel);
    }
    for (const t of firestoreData.tickets ?? []) {
      const { id: _, ...rest } = t;
      await db.tickets.add({ ...rest, tripId: localTripId } as Ticket);
    }
    for (const c of firestoreData.checklistItems ?? []) {
      const { id: _, ...rest } = c;
      await db.checklistItems.add({ ...rest, tripId: localTripId } as ChecklistItem);
    }
    for (const b of firestoreData.budgetItems ?? []) {
      const { id: _, ...rest } = b;
      await db.budgetItems.add({ ...rest, tripId: localTripId } as BudgetItem);
    }
    for (const r of firestoreData.resources ?? []) {
      const { id: _, ...rest } = r;
      await db.resources.add({ ...rest, tripId: localTripId } as Resource);
    }
  } finally {
    _importing = false;
  }
}

export function isImporting(): boolean {
  return _importing;
}

// --- Clear local Dexie data for a trip ---

async function clearLocalTripData(tripId: number): Promise<void> {
  const placeIds = (await db.places.where('tripId').equals(tripId).toArray()).map(p => p.id!);
  if (placeIds.length > 0) {
    await db.notes.where('placeId').anyOf(placeIds).delete();
    await db.attachments.filter(a => a.parentType === 'place' && placeIds.includes(a.parentId)).delete();
  }
  await db.places.where('tripId').equals(tripId).delete();
  await db.days.where('tripId').equals(tripId).delete();
  await db.flights.where('tripId').equals(tripId).delete();
  await db.hotels.where('tripId').equals(tripId).delete();
  await db.tickets.where('tripId').equals(tripId).delete();
  await db.checklistItems.where('tripId').equals(tripId).delete();
  await db.budgetItems.where('tripId').equals(tripId).delete();
  await db.resources.where('tripId').equals(tripId).delete();
}

// --- Subscribe to real-time Firestore updates ---

export function subscribeToTrip(
  firestoreTripId: string,
  localTripId: number,
  onUpdate?: () => void
): Unsubscribe {
  let lastSyncedAt = 0;

  return onSnapshot(
    doc(firestore, 'trips', firestoreTripId),
    async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as FirestoreTripDoc;

      // Skip if data hasn't changed since last import
      if (data._lastSyncedAt && data._lastSyncedAt <= lastSyncedAt) return;
      lastSyncedAt = data._lastSyncedAt || Date.now();

      await importTripFromFirestore(data, localTripId);
      onUpdate?.();
    },
    (error) => {
      console.error('Firestore trip subscription error:', error);
    }
  );
}

// --- Get or create a local trip for a Firestore trip ---

export async function getOrCreateLocalTrip(
  firestoreTripId: string,
  tripName: string
): Promise<number> {
  // Check if we already have a local trip linked to this Firestore trip
  // Use a convention: store firestoreTripId in a known place
  // For simplicity, check if a trip with matching name exists
  const existing = await db.trips.filter(t => t.name === tripName).first();
  if (existing?.id) return existing.id;

  // Create a new local trip as a placeholder
  const id = await db.trips.add({
    name: tripName,
    startDate: '',
    endDate: '',
    createdAt: Date.now(),
  });
  return id as number;
}
