import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import type { Role } from '../core/models';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  /** Roles allowed to see this link; undefined = every authenticated role. */
  requires?: Role[];
}

const NAV: NavItem[] = [
  { label: 'Items', path: '/items', icon: '▦' },
  { label: 'Record movement', path: '/movements/new', icon: '⇄' },
  { label: 'Movement log', path: '/movements', icon: '≡', requires: ['MANAGER'] },
  { label: 'Locations', path: '/locations', icon: '⚑', requires: ['MANAGER'] },
  { label: 'Low stock', path: '/reports/low-stock', icon: '⚠', requires: ['MANAGER'] },
  { label: 'Admin settings', path: '/admin/settings', icon: '⚙', requires: ['ADMIN'] },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * Preview-only copy. Held in TypeScript behind the build-time constant rather
   * than as template literals, so esbuild folds it to null and the strings never
   * reach a production bundle.
   */
  readonly previewRoleLabel = COLOSSUS_PREVIEW ? 'Preview role' : null;
  readonly previewRoleHint = COLOSSUS_PREVIEW
    ? 'Switch roles to preview navigation and permissions.'
    : null;
  readonly roleOptions: Role[] = COLOSSUS_PREVIEW ? ['CLERK', 'MANAGER', 'ADMIN'] : [];

  readonly user = this.auth.currentUser;
  readonly drawerOpen = signal(false);

  /**
   * Reconcile the cached session with the server once the authenticated shell
   * mounts. Done here rather than in a route guard so it never delays the first
   * paint, and never runs on the public login / signup screens.
   */
  ngOnInit(): void {
    void this.auth.refresh();
  }

  /** Nav links the current role is allowed to see. */
  readonly navItems = computed<NavItem[]>(() => {
    const role = this.auth.role();
    if (role === null) return [];
    return NAV.filter((item) => {
      if (!item.requires) return true;
      if (item.requires.includes(role)) return true;
      return role === 'ADMIN' && item.requires.includes('MANAGER');
    });
  });

  /** Close the mobile drawer whenever navigation completes. */
  private readonly navigated = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => {
        this.drawerOpen.set(false);
        return true;
      }),
    ),
    { initialValue: false },
  );

  readonly initials = computed(() => {
    const user = this.user();
    if (!user) return '?';
    const source = user.name?.trim() || user.email;
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
  });

  toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  onRoleChange(event: Event): void {
    const role = (event.target as HTMLSelectElement).value as Role;
    this.auth.previewSetRole(role);
  }

  logout(): void {
    void this.auth.logout();
  }
}
