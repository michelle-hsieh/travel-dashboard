import { db } from '../db/database';
import { blobToBase64, base64ToBlob } from './blob';
import type {
  Trip, Day, Place, Note, Attachment,
  Flight, Hotel, Ticket, ChecklistItem, BudgetItem, Resource,
} from '../types';

interface AttachmentExport extends Omit<Attachment, 'blob' | 'thumbnail'> {
  blobBase64: string;
  thumbnailBase64?: string;
}

interface TripExport {
  trip: Trip;
  days: Day[];
  places: Place[];
  notes: Note[];
  attachments: AttachmentExport[];
  flights: Flight[];
  hotels: Hotel[];
  tickets: Ticket[];
  checklistItems: ChecklistItem[];
  budgetItems: BudgetItem[];
  resources?: Resource[];
}

export async function exportTrip(tripId: number): Promise<TripExport> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error('Trip not found');

  const days = await db.days.where('tripId').equals(tripId).toArray();
  const places = await db.places.where('tripId').equals(tripId).toArray();
  const placeIds = places.map((p) => p.id!);
  const notes = await db.notes.where('placeId').anyOf(placeIds).toArray();

  const rawAttachments = await db.attachments.toArray();
  const relevantAttachments = rawAttachments.filter(
    (a) =>
      (a.parentType === 'place' && placeIds.includes(a.parentId)) ||
      (['flight', 'hotel', 'ticket'].includes(a.parentType) &&
        a.parentId !== undefined)
  );

  const attachments: AttachmentExport[] = await Promise.all(
    relevantAttachments.map(async (a) => {
      const { blob, thumbnail, ...rest } = a;
      return {
        ...rest,
        blobBase64: await blobToBase64(blob),
        thumbnailBase64: thumbnail ? await blobToBase64(thumbnail) : undefined,
      };
    })
  );

  const flights = await db.flights.where('tripId').equals(tripId).toArray();
  const hotels = await db.hotels.where('tripId').equals(tripId).toArray();
  const tickets = await db.tickets.where('tripId').equals(tripId).toArray();
  const checklistItems = await db.checklistItems.where('tripId').equals(tripId).toArray();
  const budgetItems = await db.budgetItems.where('tripId').equals(tripId).toArray();
  const resources = await db.resources.where('tripId').equals(tripId).toArray();

  return { trip, days, places, notes, attachments, flights, hotels, tickets, checklistItems, budgetItems, resources };
}

export async function exportAllTrips(): Promise<TripExport[]> {
  const trips = await db.trips.toArray();
  return Promise.all(trips.map((t) => exportTrip(t.id!)));
}

export async function importTrips(data: TripExport[]): Promise<void> {
  for (const tripData of data) {
    const { trip, days, places, notes, attachments, flights, hotels, tickets, checklistItems, budgetItems, resources } = tripData;

    // Remove old IDs — Dexie will assign new ones
    const { id: _tid, ...tripRest } = trip;
    const newTripId = await db.trips.add(tripRest as Trip);

    const dayIdMap = new Map<number, number>();
    for (const day of days) {
      const { id: oldId, ...rest } = day;
      const newId = await db.days.add({ ...rest, tripId: newTripId } as Day);
      if (oldId !== undefined) dayIdMap.set(oldId, newId);
    }

    const placeIdMap = new Map<number, number>();
    for (const place of places) {
      const { id: oldId, ...rest } = place;
      const newDayId = dayIdMap.get(rest.dayId) ?? rest.dayId;
      const newId = await db.places.add({ ...rest, tripId: newTripId, dayId: newDayId } as Place);
      if (oldId !== undefined) placeIdMap.set(oldId, newId);
    }

    for (const note of notes) {
      const { id: _nid, ...rest } = note;
      const newPlaceId = placeIdMap.get(rest.placeId) ?? rest.placeId;
      await db.notes.add({ ...rest, placeId: newPlaceId } as Note);
    }

    for (const att of attachments) {
      const { id: _aid, blobBase64, thumbnailBase64, ...rest } = att;
      const blob = base64ToBlob(blobBase64);
      const thumbnail = thumbnailBase64 ? base64ToBlob(thumbnailBase64) : undefined;
      let parentId = rest.parentId;
      if (rest.parentType === 'place') {
        parentId = placeIdMap.get(rest.parentId) ?? rest.parentId;
      }
      await db.attachments.add({ ...rest, parentId, blob, thumbnail } as Attachment);
    }

    for (const f of flights) {
      const { id: _fid, ...rest } = f;
      await db.flights.add({ ...rest, tripId: newTripId } as Flight);
    }
    for (const h of hotels) {
      const { id: _hid, ...rest } = h;
      await db.hotels.add({ ...rest, tripId: newTripId } as Hotel);
    }
    for (const t of tickets) {
      const { id: _tid2, ...rest } = t;
      await db.tickets.add({ ...rest, tripId: newTripId } as Ticket);
    }
    for (const c of checklistItems) {
      const { id: _cid, ...rest } = c;
      await db.checklistItems.add({ ...rest, tripId: newTripId } as ChecklistItem);
    }
    for (const b of budgetItems) {
      const { id: _bid, ...rest } = b;
      await db.budgetItems.add({ ...rest, tripId: newTripId } as BudgetItem);
    }
    if (resources) {
      for (const r of resources) {
        const { id: _rid, ...rest } = r;
        await db.resources.add({ ...rest, tripId: newTripId } as Resource);
      }
    }
  }
}

export function downloadJSON(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
