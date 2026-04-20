// types/index.ts
export interface Trip {
  id?: string;
  firebaseId?: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: number;
  adminUid?: string;
  adminEmail?: string;
  collaborators?: Record<string, Collaborator>;
  publicPermissions?: TabPermissions; // ✅ 恢復
  collaboratorEmails?: string[];
  memberEmails?: string[];
  daysCount?: number;
  placesCount?: number;
}

export interface Day {
  id?: string;
  tripId: string;
  date: string;
  dayNumber: number;
  sortOrder: number;
  notes?: string;
  startTravelMode?: 'WALKING' | 'TRANSIT' | 'DRIVING';
}

export interface TripNote {
  id?: string;
  tripId: string;
  content: string;
  sortOrder: number;
}

export interface Place {
  id?: string;
  dayId: string;
  tripId: string;
  name: string;
  lat?: number;
  lng?: number;
  placeLink?: string;
  address?: string;
  icon?: string;
  sortOrder: number;
  travelMode?: 'WALKING' | 'TRANSIT' | 'DRIVING';
  isBackup?: boolean;
  amount?: number;
  currency?: string;
}

export interface Note {
  id?: string;
  placeId: string;
  type: 'text' | 'url';
  content: string;
  url?: string;
  sortOrder: number;
}

export interface Attachment {
  id?: string;
  parentId: string;
  parentType: ParentType;
  fileName: string;
  mimeType: string;
  blob?: Blob;
  blobBase64?: string;
  thumbnail?: Blob;
  createdAt: number;
}

export interface Flight {
  id?: string;
  tripId: string;
  airline: string;
  flightNo: string;
  departureTime: string;
  departureAirport: string;
  arrivalTime: string;
  arrivalAirport: string;
  confirmNo?: string;
  sortOrder: number;
  amount?: number;
  currency?: string;
}

export interface Hotel {
  id?: string;
  tripId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeLink?: string;
  checkIn: string;
  checkOut: string;
  confirmNo?: string;
  sortOrder: number;
  amount?: number;
  currency?: string;
}

export interface Ticket {
  id?: string;
  tripId: string;
  title: string;
  date?: string;
  venue?: string;
  confirmNo?: string;
  sortOrder: number;
  amount?: number;
  currency?: string;
}

export interface ChecklistItem {
  id?: string;
  tripId: string;
  category: string;
  text: string;
  checked: boolean;
  sortOrder: number;
  amount?: number;
  currency?: string;
  recipient?: string;
  location?: string;
  notes?: string;
}

export interface BudgetItem {
  id?: string;
  tripId: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  sortOrder: number;
}

export interface Resource {
  id?: string;
  tripId: string;
  title: string;
  url: string;
  category?: string;
  sortOrder: number;
}

export type ParentType = 'place' | 'flight' | 'hotel' | 'ticket' | 'checklistItem';

export type Role = 'admin' | 'member' | 'guest';
export type PermissionLevel = 'none' | 'read' | 'write';
export type PermissionTab = 'planner' | 'flights' | 'hotels' | 'tickets' | 'resources';
export type TabPermissions = Record<PermissionTab, PermissionLevel>;

export interface Collaborator {
  email: string;
  permissions: TabPermissions;
}

export interface TripMeta {
  name?: string;
  startDate?: string;
  endDate?: string;
  adminUid: string;
  adminEmail: string;
  collaborators: Record<string, Collaborator>;
  publicPermissions?: TabPermissions; // ✅ 恢復
}
