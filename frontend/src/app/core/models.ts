/** Domain types mirroring the backend response shapes (see .pipeline/tasks.md surface contract). */

export type Role = 'USER' | 'CLERK' | 'MANAGER' | 'ADMIN';
export type MovementType = 'IN' | 'OUT' | 'TRANSFER';

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  unit: string;
  reorderAt: number;
  createdAt: string;
}

/** GET /api/items row — item plus summed StockLevel. */
export interface ItemWithTotals extends Item {
  totalQty: number;
}

export interface Location {
  id: string;
  name: string;
  zone: string;
  createdAt: string;
}

/** Per-location breakdown row on GET /api/items/:id. */
export interface StockLevel {
  id: string;
  itemId: string;
  locationId: string;
  locationName: string;
  zone: string;
  qty: number;
}

/** GET /api/movements row — joined to item / location / user names. */
export interface Movement {
  id: string;
  type: MovementType;
  itemId: string;
  itemSku: string;
  itemName: string;
  fromLocId?: string | null;
  fromLocName?: string | null;
  toLocId?: string | null;
  toLocName?: string | null;
  qty: number;
  note?: string | null;
  userId: string;
  userEmail: string;
  createdAt: string;
}

/** GET /api/reports/low-stock row. */
export interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  totalQty: number;
  reorderAt: number;
  shortfall: number;
}

/** GET /api/admin/settings entry — value is masked by the server. */
export interface SettingEntry {
  key: string;
  service: string;
  label: string;
  value: string;
  configured: boolean;
}

/** Paginated list envelope returned by the list endpoints. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Normalised error shape the UI renders inline. */
export interface ApiError {
  message: string;
  fieldErrors?: Record<string, string>;
}
