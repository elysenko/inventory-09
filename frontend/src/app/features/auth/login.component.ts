import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./auth.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * Preview-only shortcut label. Held in TypeScript behind the build-time
   * constant (never in the template, never in an environment file) so the whole
   * affordance is dead-code-eliminated from production bundles.
   */
  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : null;

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  // Ships empty — no prefilled or seeded credentials.
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  errorFor(field: 'email' | 'password'): string | null {
    const server = this.fieldErrors()[field];
    if (server) return server;
    const control = this.form.controls[field];
    if (control.touched && control.hasError('required')) {
      return field === 'email' ? 'Enter your email address.' : 'Enter your password.';
    }
    return null;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.fieldErrors.set({});

    if (this.form.invalid) return;

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    const error = await this.auth.login(email, password);
    this.submitting.set(false);

    if (error) {
      this.formError.set(error.message);
      this.fieldErrors.set(error.fieldErrors ?? {});
      return;
    }

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      await this.router.navigateByUrl(returnUrl);
    }
  }

  async skipLogin(): Promise<void> {
    await this.auth.previewSignIn();
  }
}
