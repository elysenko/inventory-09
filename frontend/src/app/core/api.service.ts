import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  Item,
  ItemDetail,
  ItemWithTotals,
  Location,
  LowStockRow,
  Movement,
  MovementType,
  Paginated,
  SettingEntry,
  StockLevel,
  User,
} from './models';

/**
 * Base path for every API call.
 *
 * Origin-absolute, matching `glue.frontend_api_base` in colossus.stack.json and
 * the `location /api/` block in nginx.conf, which reverse-proxies to the NestJS
 * container. It deliberately does NOT follow `<base href>`: index.html rewrites
 * that to a path prefix when the SPA is mounted under one, and nginx still
 * serves the API at the origin root, so deriving the base from it would point
 * the calls at a path nothing answers on.
 */
const API_BASE = '/api';

/** Hard ceiling matching the server's MAX_PAGE_SIZE. */
const MAX_PAGE_SIZE = 100;
/** Bounds the catalogue-wide fetch so a large table cannot spin forever. */
const MAX_FETCH_ALL_PAGES = 20;
/** Concurrent `GET /api/items/:id` calls when building the warehouse-wide view. */
const STOCK_FANOUT_BATCH = 8;

export interface ItemQuery {
  q?: string;
  lowOnly?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface MovementQuery {
  itemId?: string;
  userId?: string;
  type?: MovementType | '';
  /** Inclusive date bounds; accepts either `YYYY-MM-DD` or a full ISO string. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateItemInput {
  sku: string;
  name: string;
  description?: string;
  unit: string;
  reorderAt: number;
}

export interface CreateMovementInput {
  type: MovementType;
  itemId: string;
  fromLocId?: string;
  toLocId?: string;
  qty: number;
  note?: string;
}

export interface AuthResult {
  accessToken: string;
  user: User;
}

/**
 * The single HTTP surface between the Angular app and the NestJS API.
 *
 * Every screen goes through here rather than injecting `HttpClient` directly,
 * so the route paths, query-param encoding and pagination envelope live in one
 * place and stay in step with the controllers.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  readonly base = API_BASE;

  /** Drops undefined / empty values so they are not sent as `?q=` noise. */
  private static params(source: Record<string, string | number | boolean | undefined>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === '') continue;
      params = params.set(key, String(value));
    }
    return params;
  }

  private get<T>(path: string, params?: HttpParams): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${API_BASE}${path}`, { params }));
  }

  // ---------------------------------------------------------------- auth ----

  login(email: string, password: string): Promise<AuthResult> {
    return firstValueFrom(
      this.http.post<AuthResult>(`${API_BASE}/auth/login`, { email, password }),
    );
  }

  signup(email: string, password: string, name?: string): Promise<AuthResult> {
    return firstValueFrom(
      this.http.post<AuthResult>(`${API_BASE}/auth/signup`, { email, password, name }),
    );
  }

  me(): Promise<User> {
    return this.get<User>('/auth/me');
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${API_BASE}/auth/logout`, {}));
  }

  // --------------------------------------------------------------- items ----

  listItems(query: ItemQuery = {}): Promise<Paginated<ItemWithTotals>> {
    return this.get<Paginated<ItemWithTotals>>(
      '/items',
      ApiService.params({
        q: query.q,
        lowOnly: query.lowOnly,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  }

  /**
   * Pulls the whole catalogue.
   *
   * The item list, movement form and movement-log filter all present the full
   * catalogue (the header counts "N of M items", the pickers list everything),
   * so they need the complete set rather than one server page. Requests run at
   * the server's maximum page size and stop as soon as a short page arrives.
   */
  async listAllItems(): Promise<ItemWithTotals[]> {
    const rows: ItemWithTotals[] = [];
    for (let page = 1; page <= MAX_FETCH_ALL_PAGES; page += 1) {
      const result = await this.listItems({ page, pageSize: MAX_PAGE_SIZE });
      rows.push(...result.data);
      if (rows.length >= result.total || result.data.length < MAX_PAGE_SIZE) break;
    }
    return rows;
  }

  /**
   * Every per-location stock row in the warehouse.
   *
   * The API exposes the breakdown per item (`GET /api/items/:id`) and has no
   * warehouse-wide stock endpoint, so this fans out over the catalogue. Calls
   * run in bounded batches rather than all at once so a large catalogue cannot
   * open hundreds of concurrent sockets. Only the locations screen needs this;
   * every other screen reads the breakdown for a single item.
   */
  async listStockLevels(): Promise<StockLevel[]> {
    const items = await this.listAllItems();
    const rows: StockLevel[] = [];
    for (let i = 0; i < items.length; i += STOCK_FANOUT_BATCH) {
      const batch = items.slice(i, i + STOCK_FANOUT_BATCH);
      const details = await Promise.all(batch.map((item) => this.getItem(item.id)));
      for (const detail of details) rows.push(...detail.byLocation);
    }
    return rows;
  }

  getItem(id: string): Promise<ItemDetail> {
    return this.get<ItemDetail>(`/items/${encodeURIComponent(id)}`);
  }

  createItem(input: CreateItemInput): Promise<ItemWithTotals> {
    return firstValueFrom(this.http.post<ItemWithTotals>(`${API_BASE}/items`, input));
  }

  updateItem(id: string, input: Partial<CreateItemInput>): Promise<ItemWithTotals> {
    return firstValueFrom(
      this.http.patch<ItemWithTotals>(`${API_BASE}/items/${encodeURIComponent(id)}`, input),
    );
  }

  deleteItem(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_BASE}/items/${encodeURIComponent(id)}`));
  }

  // ----------------------------------------------------------- locations ----

  listLocations(): Promise<Location[]> {
    return this.get<Location[]>('/locations');
  }

  getLocation(id: string): Promise<Location> {
    return this.get<Location>(`/locations/${encodeURIComponent(id)}`);
  }

  createLocation(input: { name: string; zone: string }): Promise<Location> {
    return firstValueFrom(this.http.post<Location>(`${API_BASE}/locations`, input));
  }

  updateLocation(id: string, input: { name?: string; zone?: string }): Promise<Location> {
    return firstValueFrom(
      this.http.patch<Location>(`${API_BASE}/locations/${encodeURIComponent(id)}`, input),
    );
  }

  deleteLocation(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API_BASE}/locations/${encodeURIComponent(id)}`),
    );
  }

  // ----------------------------------------------------------- movements ----

  createMovement(input: CreateMovementInput): Promise<Movement> {
    return firstValueFrom(this.http.post<Movement>(`${API_BASE}/movements`, input));
  }

  /**
   * Manager-only audit log.
   *
   * `from` / `to` are passed through as the `YYYY-MM-DD` the date inputs
   * produce. The server treats `to` as inclusive and stretches a date-only
   * bound to the end of that day itself, so widening it here as well would only
   * duplicate a rule that can then drift out of step with it.
   */
  listMovements(query: MovementQuery = {}): Promise<Paginated<Movement>> {
    return this.get<Paginated<Movement>>(
      '/movements',
      ApiService.params({
        itemId: query.itemId,
        userId: query.userId,
        type: query.type,
        from: query.from,
        to: query.to,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  }

  // ------------------------------------------------------------- reports ----

  lowStock(): Promise<LowStockRow[]> {
    return this.get<LowStockRow[]>('/reports/low-stock');
  }

  // --------------------------------------------------------------- admin ----

  listSettings(): Promise<SettingEntry[]> {
    return this.get<SettingEntry[]>('/admin/settings');
  }

  updateSettings(entries: { key: string; value: string }[]): Promise<SettingEntry[]> {
    return firstValueFrom(
      this.http.patch<SettingEntry[]>(`${API_BASE}/admin/settings`, { entries }),
    );
  }
}

/** Re-exported so callers do not need to know the `Item` type is separate. */
export type { Item };
