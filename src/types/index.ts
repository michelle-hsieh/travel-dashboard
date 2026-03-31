export interface Trip {
  id?: number;
  firebaseId?: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: number;
  adminUid?: string;
  adminEmail?: string;
  collaborators?: Record<string, Collaborator>;
  collaboratorEmails?: string[];
  memberEmails?: string[];
  daysCount?: number;
  placesCount?: number;
}

export interface Day {
  id?: number;
  tripId: number;
  date: string;
  dayNumber: number;
  sortOrder: number;
}

export interface Place {
  id?: number;
  dayId: number;
  tripId: number;
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
  id?: number;
  placeId: number;
  type: 'text' | 'url';
  content: string;
  url?: string;
  sortOrder: number;
}

export interface Attachment {
  id?: number;
  parentId: number;
  parentType: 'place' | 'flight' | 'hotel' | 'ticket';
  fileName: string;
  mimeType: string;
  blob: Blob;
  thumbnail?: Blob;
  createdAt: number;
}

export interface Flight {
  id?: number;
  tripId: number;
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
  id?: number;
  tripId: number;
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
  id?: number;
  tripId: number;
  title: string;
  date?: string;
  venue?: string;
  confirmNo?: string;
  sortOrder: number;
  amount?: number;
  currency?: string;
}

export interface ChecklistItem {
  id?: number;
  tripId: number;
  category: string;
  text: string;
  checked: boolean;
  sortOrder: number;
  amount?: number;
  currency?: string;
}

export interface BudgetItem {
  id?: number;
  tripId: number;
  category: string;
  description: string;
  amount: number;
  currency: string;
  sortOrder: number;
}

export interface Resource {
  id?: number;
  tripId: number;
  title: string;
  url: string;
  category?: string;
  sortOrder: number;
}

export type ParentType = 'place' | 'flight' | 'hotel' | 'ticket';

/* ===================== Auth & Permissions ===================== */

export type Role = 'admin' | 'member' | 'guest';

export type PermissionLevel = 'none' | 'read' | 'write';

export type PermissionTab = 'planner' | 'flights' | 'hotels' | 'tickets' | 'resources';

export type TabPermissions = Record<PermissionTab, PermissionLevel>;

export interface Collaborator {
  email: string;
  permissions: TabPermissions;
}

export interface TripMeta {
  adminUid: string;
  adminEmail: string;
  collaborators: Record<string, Collaborator>; // keyed by sanitized email
}
