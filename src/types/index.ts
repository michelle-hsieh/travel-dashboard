// types/index.ts
export interface Trip {
  id?: string; // ✅ 改為字串 (Firestore doc.id)
  firebaseId?: string; // 其實可以慢慢廢棄，因為 id 就是 firebaseId
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
  id?: string; // ✅
  tripId: string; // ✅ 改為字串
  date: string;
  dayNumber: number;
  sortOrder: number;
}

export interface Place {
  id?: string; // ✅
  dayId: string; // ✅
  tripId: string; // ✅
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
  id?: string; // ✅
  placeId: string; // ✅
  type: 'text' | 'url';
  content: string;
  url?: string;
  sortOrder: number;
}

export interface Attachment {
  id?: string; // ✅
  parentId: string; // ✅
  parentType: ParentType;
  fileName: string;
  mimeType: string;
  blob: Blob; // 注意：若要完全無伺服器，Blob 不能直接存 Firestore，需要存 Firebase Storage。這裡先保留。
  thumbnail?: Blob;
  createdAt: number;
}

export interface Flight {
  id?: string; // ✅
  tripId: string; // ✅
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
  id?: string; // ✅
  tripId: string; // ✅
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
  id?: string; // ✅
  tripId: string; // ✅
  title: string;
  date?: string;
  venue?: string;
  confirmNo?: string;
  sortOrder: number;
  amount?: number;
  currency?: string;
}

export interface ChecklistItem {
  id?: string; // ✅
  tripId: string; // ✅
  category: string;
  text: string;
  checked: boolean;
  sortOrder: number;
  amount?: number;
  currency?: string;
}

export interface BudgetItem {
  id?: string; // ✅
  tripId: string; // ✅
  category: string;
  description: string;
  amount: number;
  currency: string;
  sortOrder: number;
}

export interface Resource {
  id?: string; // ✅
  tripId: string; // ✅
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
  name?: string; // ✅ 儲存旅程名稱
  adminUid: string;
  adminEmail: string;
  collaborators: Record<string, Collaborator>;
}