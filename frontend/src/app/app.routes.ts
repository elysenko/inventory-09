import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { roleGuard } from './core/role.guard';

/**
 * Every navigable state is addressable. Tabs, filters and destructive confirms
 * live in query params (?tab=, ?q=, ?modal=delete&id=) rather than component
 * state, so each one is deep-linkable and reviewable by URL.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
    title: 'Sign in — StockRoom',
    data: { flow: 'auth.login' },
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/auth/signup.component').then((m) => m.SignupComponent),
    title: 'Create account — StockRoom',
    data: { flow: 'auth.signup' },
  },
  {
    path: '',
    loadComponent: () => import('./shared/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'items' },
      {
        path: 'items',
        loadComponent: () =>
          import('./features/items/item-list.component').then((m) => m.ItemListComponent),
        title: 'Items — StockRoom',
        data: { flow: 'items.list' },
      },
      {
        path: 'items/new',
        loadComponent: () =>
          import('./features/items/item-form.component').then((m) => m.ItemFormComponent),
        canActivate: [roleGuard(['MANAGER'])],
        title: 'New item — StockRoom',
        data: { flow: 'items.create' },
      },
      {
        path: 'items/:id/edit',
        loadComponent: () =>
          import('./features/items/item-form.component').then((m) => m.ItemFormComponent),
        canActivate: [roleGuard(['MANAGER'])],
        title: 'Edit item — StockRoom',
        data: { flow: 'items.edit' },
      },
      {
        path: 'items/:id',
        loadComponent: () =>
          import('./features/items/item-detail.component').then((m) => m.ItemDetailComponent),
        title: 'Item — StockRoom',
        data: { flow: 'items.detail' },
      },
      {
        path: 'locations',
        loadComponent: () =>
          import('./features/locations/location-list.component').then(
            (m) => m.LocationListComponent,
          ),
        canActivate: [roleGuard(['MANAGER'])],
        title: 'Locations — StockRoom',
        data: { flow: 'locations.list' },
      },
      {
        path: 'locations/new',
        loadComponent: () =>
          import('./features/locations/location-form.component').then(
            (m) => m.LocationFormComponent,
          ),
        canActivate: [roleGuard(['MANAGER'])],
        title: 'New location — StockRoom',
        data: { flow: 'locations.create' },
      },
      {
        path: 'locations/:id/edit',
        loadComponent: () =>
          import('./features/locations/location-form.component').then(
            (m) => m.LocationFormComponent,
          ),
        canActivate: [roleGuard(['MANAGER'])],
        title: 'Edit location — StockRoom',
        data: { flow: 'locations.edit' },
      },
      {
        path: 'movements/new',
        loadComponent: () =>
          import('./features/movements/movement-form.component').then(
            (m) => m.MovementFormComponent,
          ),
        title: 'Record movement — StockRoom',
        data: { flow: 'movements.create' },
      },
      {
        path: 'movements',
        loadComponent: () =>
          import('./features/movements/movement-log.component').then((m) => m.MovementLogComponent),
        canActivate: [roleGuard(['MANAGER'])],
        title: 'Movement log — StockRoom',
        data: { flow: 'movements.log' },
      },
      {
        path: 'reports/low-stock',
        loadComponent: () =>
          import('./features/reports/low-stock.component').then((m) => m.LowStockComponent),
        canActivate: [roleGuard(['MANAGER'])],
        title: 'Low stock — StockRoom',
        data: { flow: 'reports.lowStock' },
      },
      {
        path: 'admin/settings',
        loadComponent: () =>
          import('./features/admin/settings.component').then((m) => m.SettingsComponent),
        canActivate: [roleGuard(['ADMIN'])],
        title: 'Admin settings — StockRoom',
        data: { flow: 'admin.settings' },
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
