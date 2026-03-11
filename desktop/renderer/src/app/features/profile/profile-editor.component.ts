import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { Profile } from '../../core/services/electron.service';

@Component({
  selector: 'app-profile-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="profile-editor">
      <header class="page-header">
        <h1>Profile Configuration</h1>
        <p class="subtitle">Your information is used to fill opt-out forms</p>
      </header>

      <div class="privacy-notice">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/>
          <path d="M12 8a2 2 0 100 4 2 2 0 000-4z"/>
          <path d="M12 12v5"/>
        </svg>
        <p>Your data stays on your machine. This app does not collect, store, or transmit your personal information to any server. It is only used locally to auto-fill opt-out forms.</p>
      </div>

      @if (isLoading()) {
        <div class="loading">Loading profile...</div>
      } @else {
        <form class="profile-form" (ngSubmit)="saveProfile()">
          <div class="form-section">
            <h2>Personal Information</h2>

            <div class="form-group">
              <label for="fullName">Full Name *</label>
              <input
                id="fullName"
                type="text"
                [(ngModel)]="profile.fullName"
                name="fullName"
                required
                placeholder="John Doe"
              />
            </div>

            <div class="form-group">
              <label for="email">Email Address *</label>
              <input
                id="email"
                type="email"
                [(ngModel)]="profile.email"
                name="email"
                required
                placeholder="johndoe@example.com"
              />
            </div>

            <div class="form-group">
              <label for="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                [(ngModel)]="profile.phone"
                name="phone"
                placeholder="(555) 123-4567"
              />
              <small>Optional - some brokers require phone verification</small>
            </div>
          </div>

          <div class="form-section">
            <h2>Address Information</h2>

            <div class="form-group">
              <label for="address">Street Address</label>
              <input
                id="address"
                type="text"
                [(ngModel)]="profile.address"
                name="address"
                placeholder="123 Main St"
              />
            </div>

            <div class="form-row">
              <div class="form-group flex-2">
                <label for="city">City</label>
                <input
                  id="city"
                  type="text"
                  [(ngModel)]="profile.city"
                  name="city"
                  placeholder="New York"
                />
              </div>

              <div class="form-group flex-1">
                <label for="state">State</label>
                <select id="state" [(ngModel)]="profile.state" name="state">
                  <option value="">Select...</option>
                  @for (state of states; track state.code) {
                    <option [value]="state.code">{{ state.code }}</option>
                  }
                </select>
              </div>

              <div class="form-group flex-1">
                <label for="zip">ZIP Code</label>
                <input
                  id="zip"
                  type="text"
                  [(ngModel)]="profile.zip"
                  name="zip"
                  placeholder="10001"
                  maxlength="10"
                />
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" (click)="goBack()">
              Cancel
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="isSaving() || !isValid()"
            >
              @if (isSaving()) {
                Saving...
              } @else {
                Save Profile
              }
            </button>
          </div>

          @if (saveMessage()) {
            <div class="save-message" [class.error]="saveError()">
              {{ saveMessage() }}
            </div>
          }
        </form>
      }
    </div>
  `,
  styles: [`
    .profile-editor {
      padding: 2rem;
      max-width: 600px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 2rem;
      h1 { margin: 0 0 0.25rem 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
      .subtitle { margin: 0; color: var(--text-secondary); font-size: 0.8125rem; }
    }

    .profile-form {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-card);
    }

    .form-section {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border-color);
      &:last-of-type { border-bottom: none; }

      h2 {
        margin: 0 0 1rem 0;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
      }
    }

    .form-group {
      margin-bottom: 1rem;
      &:last-child { margin-bottom: 0; }

      label {
        display: block;
        margin-bottom: 0.375rem;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--text-primary);
      }

      input, select {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-size: 0.875rem;
        background: var(--bg-input);
        color: var(--text-primary);
        transition: border-color 0.2s, box-shadow 0.2s;

        &:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-glow);
        }
        &::placeholder { color: var(--text-muted); }
      }

      small { display: block; margin-top: 0.25rem; font-size: 0.6875rem; color: var(--text-muted); }
    }

    .form-row {
      display: flex;
      gap: 0.75rem;
      .flex-1 { flex: 1; }
      .flex-2 { flex: 2; }
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
      border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    }

    .save-message {
      margin: 1rem 1.5rem;
      padding: 0.625rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      background: var(--color-success-glow);
      color: var(--color-success);
      &.error { background: var(--color-danger-glow); color: var(--color-danger); }
    }

    .privacy-notice {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.75rem 1rem;
      margin-bottom: 1.5rem;
      background: var(--color-primary-glow);
      border: 1px solid var(--border-active);
      border-radius: var(--radius-md);
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.5;

      svg {
        flex-shrink: 0;
        color: var(--color-primary);
        margin-top: 0.125rem;
      }

      p { margin: 0; }
    }

    .loading { text-align: center; padding: 3rem; color: var(--text-secondary); }
  `]
})
export class ProfileEditorComponent implements OnInit {
  private configService = inject(ConfigService);
  private router = inject(Router);

  protected profile: Profile = {
    fullName: '',
    email: '',
    phone: null,
    address: null,
    city: '',
    state: '',
    zip: ''
  };

  protected isLoading = signal(true);
  protected isSaving = signal(false);
  protected saveMessage = signal('');
  protected saveError = signal(false);

  protected states = [
    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
    { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
    { code: 'DC', name: 'District of Columbia' }
  ];

  async ngOnInit(): Promise<void> {
    try {
      const profile = await this.configService.loadAll().then(() =>
        this.configService.profile()
      );
      if (profile) {
        this.profile = { ...profile };
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  isValid(): boolean {
    return !!(this.profile.fullName?.trim() && this.profile.email?.trim());
  }

  async saveProfile(): Promise<void> {
    if (!this.isValid()) return;

    this.isSaving.set(true);
    this.saveMessage.set('');
    this.saveError.set(false);

    try {
      await this.configService.saveProfile(this.profile);
      this.saveMessage.set('Profile saved successfully!');
      setTimeout(() => this.saveMessage.set(''), 3000);
    } catch (error) {
      this.saveError.set(true);
      this.saveMessage.set(
        error instanceof Error ? error.message : 'Failed to save profile'
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
