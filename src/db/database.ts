import Dexie, { type Table } from 'dexie';
import type {
  Trip, Day, Place, Note, Attachment,
  Flight, Hotel, Ticket, ChecklistItem, BudgetItem, Resource,
} from '../types';

export class TravelDB extends Dexie {
  trips!: Table<Trip, number>;
  days!: Table<Day, number>;
  places!: Table<Place, number>;
  notes!: Table<Note, number>;
  attachments!: Table<Attachment, number>;
  flights!: Table<Flight, number>;
  hotels!: Table<Hotel, number>;
  tickets!: Table<Ticket, number>;
  checklistItems!: Table<ChecklistItem, number>;
  budgetItems!: Table<BudgetItem, number>;
  resources!: Table<Resource, number>;

  constructor() {
    super('TravelDB');
    this.version(1).stores({
      trips: '++id, name, createdAt',
      days: '++id, tripId, date, dayNumber, sortOrder',
      places: '++id, dayId, tripId, sortOrder',
      notes: '++id, placeId, sortOrder',
      attachments: '++id, parentId, parentType, createdAt',
      flights: '++id, tripId, sortOrder',
      hotels: '++id, tripId, sortOrder',
      tickets: '++id, tripId, sortOrder',
      checklistItems: '++id, tripId, category, sortOrder',
      budgetItems: '++id, tripId, sortOrder',
      resources: '++id, tripId, sortOrder',
    });
    this.version(2).stores({
      attachments: '++id, [parentType+parentId], parentId, parentType, createdAt',
    });
  }
}

export const db = new TravelDB();
