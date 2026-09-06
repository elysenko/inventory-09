import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Cross-field check: confirmation must match the password. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return !confirm || password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrls: ['./auth.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required]],
      email: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  errorFor(field: 'name' | 'email' | 'password' | 'confirmPassword'): string | null {
    const control = this.form.controls[field];
    if (!control.touched) return null;
    if (control.hasError('required')) {
      const labels = {
        name: 'Enter your full name.',
        email: 'Enter your email address.',
        password: 'Choose a password.',
        confirmPassword: 'Re-enter your password.',
      } as const;
      return labels[field];
    }
    if (control.hasError('minlength')) return 'Use at least 8 characters.';
    if (field === 'confirmPassword' && this.form.hasError('mismatch')) {
      return 'Passwords do not match.';
    }
    return null;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid) return;

    this.submitting.set(true);
    const { name, email, password } = this.form.getRawValue();
    const error = await this.auth.signup(name, email, password);
    this.submitting.set(false);
    if (error) this.formError.set(error.message);
  }
}
