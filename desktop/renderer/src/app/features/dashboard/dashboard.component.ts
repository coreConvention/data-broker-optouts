import { Component, inject, OnInit, computed, signal } from '@angular/core';

import { RouterLink } from '@angular/router';
import { RunService } from '../../core/services/run.service';
import { ConfigService } from '../../core/services/config.service';
import { ElectronService } from '../../core/services/electron.service';
import { ProgressBarComponent } from '../../shared/components/progress-bar/progress-bar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, ProgressBarComponent, StatusBadgeComponent],
  template: `
    <div class="dashboard">
      <!-- Hero Header -->
      <header class="hero animate-in">
        <div class="hero-text">
          <h1>Privacy<span class="accent">Shield</span></h1>
          <p class="tagline">Data Broker Opt-Out Engine</p>
        </div>
        <span class="version mono">v{{ appVersion() }}</span>
      </header>

      <!-- Stat Cards -->
      <section class="stats-grid">
        <div class="stat-card animate-in stagger-1">
          <div class="stat-icon total">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
          </div>
          <span class="stat-value">{{ configService.brokerCount() }}</span>
          <span class="stat-label">Total Brokers</span>
        </div>

        <div class="stat-card animate-in stagger-2">
          <div class="stat-icon selected">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
          </div>
          <span class="stat-value">{{ runService.getSelectedCount() }}</span>
          <span class="stat-label">Selected</span>
        </div>

        <div class="stat-card animate-in stagger-3">
          <div class="stat-icon success">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 12l3 3 5-5"/>
            </svg>
          </div>
          <span class="stat-value">{{ stats().success }}</span>
          <span class="stat-label">Completed</span>
        </div>

        <div class="stat-card animate-in stagger-4">
          <div class="stat-icon manual">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 9v4M12 17h.01"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <span class="stat-value">{{ stats().manual }}</span>
          <span class="stat-label">Manual</span>
        </div>
      </section>

      <!-- Progress Panel -->
      @if (isRunning()) {
        <section class="progress-panel card animate-in">
          <h2>Progress</h2>
          <app-progress-bar
            [value]="progressPercent()"
            [label]="progressLabel()"
          />
          <div class="current-broker">
            @if (currentBroker()) {
              <app-status-badge [status]="currentStatus() ?? 'pending'" />
              <span class="broker-name mono">{{ currentBroker() }}</span>
              @if (currentMessage()) {
                <span class="broker-msg">{{ currentMessage() }}</span>
              }
            }
          </div>
        </section>
      }

      <!-- Controls -->
      <section class="controls-panel card animate-in stagger-3">
        <h2>Controls</h2>
        <div class="controls-row">
          @if (!isRunning()) {
            <button
              class="btn btn-primary btn-run"
              (click)="startRun()"
              [disabled]="!canStart()"
              [title]="startDisabledReason()"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,3 20,12 6,21"/>
              </svg>
              Start Opt-Out Process
            </button>
            @if (!canStart() && !isRunning()) {
              <span class="start-hint">{{ startDisabledReason() }}</span>
            }
          } @else {
            @if (!isPaused()) {
              <button class="btn btn-warning" (click)="pauseRun()">Pause</button>
            } @else {
              <button class="btn btn-success" (click)="resumeRun()">Resume</button>
            }
            <button class="btn btn-danger" (click)="stopRun()">Stop</button>
          }
        </div>

        <div class="toggles">
          <label class="toggle-label">
            <input type="checkbox" [checked]="headful()" (change)="toggleHeadful()" [disabled]="isRunning()"/>
            <span class="toggle-text">Show browser</span>
          </label>
          <label class="toggle-label">
            <input type="checkbox" [checked]="stealth()" (change)="toggleStealth()" [disabled]="isRunning()"/>
            <span class="toggle-text">Stealth mode</span>
          </label>
          <label class="toggle-label">
            <input type="checkbox" [checked]="dryRun()" (change)="toggleDryRun()" [disabled]="isRunning()"/>
            <span class="toggle-text">Dry run</span>
          </label>
        </div>
      </section>

      <!-- Human Input Modal -->
      @if (humanInputPrompt()) {
        <div class="modal-overlay">
          <div class="modal card">
            <div class="modal-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="1.5">
                <path d="M12 9v4M12 17h.01"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
            </div>
            <h3>Action Required</h3>
            <p>{{ humanInputPrompt() }}</p>
            <button class="btn btn-primary" (click)="submitHumanInput()">Continue</button>
          </div>
        </div>
      }

      <!-- Quick Nav -->
      <section class="quick-nav animate-in stagger-4">
        <a routerLink="/brokers" class="nav-card card">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
          </svg>
          <span>Manage Brokers</span>
        </a>
        <a routerLink="/profile" class="nav-card card">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="8" r="4"/>
            <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/>
          </svg>
          <span>Edit Profile</span>
        </a>
        <a routerLink="/logs" class="nav-card card">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 6h16M4 10h16M4 14h10M4 18h7"/>
          </svg>
          <span>View Logs</span>
        </a>
        <a routerLink="/settings" class="nav-card card">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          <span>Settings</span>
        </a>
      </section>

      <!-- Manifest Update Banner -->
      @if (manifestUpdate()) {
        <div class="update-banner animate-in">
          <span>New broker list available! {{ manifestUpdate()!.added.length }} added</span>
          <button class="btn btn-sm btn-primary" (click)="applyUpdate()">Update</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .dashboard {
      padding: 2rem;
      max-width: 960px;
      margin: 0 auto;
    }

    /* ── Hero ── */
    .hero {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }

    .hero h1 {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text-primary);
    }

    .hero .accent {
      color: var(--color-primary);
    }

    .hero .tagline {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      margin-top: 0.125rem;
    }

    .hero .version {
      font-size: 0.75rem;
      color: var(--text-muted);
      background: var(--bg-secondary);
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm);
    }

    /* ── Stats ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .stat-card {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 1.25rem 1rem;
      text-align: center;
      transition: border-color 0.25s, box-shadow 0.25s;

      &:hover {
        border-color: var(--border-active);
        box-shadow: var(--shadow-glow);
      }
    }

    .stat-icon {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 0.75rem;

      &.total { background: var(--color-primary-glow); color: var(--color-primary); }
      &.selected { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
      &.success { background: var(--color-success-glow); color: var(--color-success); }
      &.manual { background: var(--color-warning-glow); color: var(--color-warning); }
    }

    .stat-value {
      display: block;
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .stat-label {
      display: block;
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    /* ── Progress ── */
    .progress-panel, .controls-panel {
      padding: 1.25rem;
      margin-bottom: 1.5rem;

      h2 {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
        margin-bottom: 1rem;
      }
    }

    .current-broker {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1rem;
      padding: 0.625rem 0.75rem;
      background: var(--bg-secondary);
      border-radius: var(--radius-sm);

      .broker-name { font-weight: 500; font-size: 0.875rem; }
      .broker-msg { color: var(--text-secondary); font-size: 0.8125rem; }
    }

    /* ── Controls ── */
    .controls-row {
      display: flex;
      gap: 0.625rem;
      margin-bottom: 1rem;
    }

    .btn-run {
      padding: 0.625rem 1.5rem;
      font-size: 0.875rem;
    }

    .start-hint {
      display: block;
      font-size: 0.75rem;
      color: var(--color-warning);
      margin-top: 0.375rem;
    }

    .toggles {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
    }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.8125rem;
      color: var(--text-secondary);

      input[type="checkbox"] {
        appearance: none;
        width: 1rem;
        height: 1rem;
        border: 1.5px solid var(--border-color);
        border-radius: 3px;
        background: var(--bg-input);
        cursor: pointer;
        transition: all 0.15s;
        display: grid;
        place-content: center;

        &::before {
          content: '';
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 1.5px;
          background: var(--color-primary);
          transform: scale(0);
          transition: transform 0.15s;
        }

        &:checked {
          border-color: var(--color-primary);
          &::before { transform: scale(1); }
        }
      }
    }

    /* ── Quick Nav ── */
    .quick-nav {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
    }

    .nav-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.625rem;
      padding: 1.25rem 0.75rem;
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 0.8125rem;
      font-weight: 500;
      transition: all 0.25s;

      svg { color: var(--text-muted); transition: color 0.25s; }

      &:hover {
        color: var(--color-primary);
        text-decoration: none;
        border-color: var(--border-active);
        transform: translateY(-2px);
        box-shadow: var(--shadow-glow);
        svg { color: var(--color-primary); }
      }
    }

    /* ── Modal ── */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      padding: 2rem;
      max-width: 380px;
      width: 90%;
      text-align: center;

      .modal-icon { margin-bottom: 1rem; }
      h3 { margin-bottom: 0.75rem; font-size: 1.125rem; }
      p { margin-bottom: 1.5rem; color: var(--text-secondary); font-size: 0.875rem; }
    }

    /* ── Update Banner ── */
    .update-banner {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.25rem;
      background: var(--bg-card-solid);
      border: 1px solid var(--border-active);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-elevated);
      font-size: 0.8125rem;
      color: var(--text-primary);
    }
  `]
})
export class DashboardComponent implements OnInit {
  protected runService = inject(RunService);
  protected configService = inject(ConfigService);
  private electronService = inject(ElectronService);

  protected appVersion = signal('1.0.0');
  protected headful = signal(true);
  protected stealth = signal(true);
  protected dryRun = signal(false);

  protected isRunning = this.runService.isRunning;
  protected isPaused = this.runService.isPaused;
  protected progressPercent = this.runService.progressPercent;
  protected currentBroker = this.runService.currentBroker;
  protected currentStatus = this.runService.currentStatus;
  protected currentMessage = this.runService.currentMessage;
  protected stats = this.runService.stats;
  protected humanInputPrompt = this.runService.humanInputPrompt;
  protected manifestUpdate = this.electronService.manifestUpdateAvailable;

  protected progressLabel = computed(() => {
    const progress = this.runService.progress();
    if (!progress) return '';
    return `${progress.current} / ${progress.total} brokers`;
  });

  protected canStart = computed(() => {
    return this.configService.profileComplete() &&
           this.configService.brokerCount() > 0;
  });

  protected startDisabledReason = computed(() => {
    const reasons: string[] = [];
    if (!this.configService.profileComplete()) reasons.push('complete your profile');
    if (this.configService.brokerCount() === 0) reasons.push('load broker manifest');
    if (reasons.length === 0) return '';
    return 'To start, ' + reasons.join(' and ');
  });

  async ngOnInit(): Promise<void> {
    await this.configService.loadAll();
    const settings = this.configService.settings();
    if (settings) {
      this.headful.set(settings.headful);
      this.stealth.set(settings.stealth);
    }
    this.appVersion.set(await this.electronService.getAppVersion());
    if (this.configService.settings()?.autoCheckManifestUpdates) {
      await this.configService.checkForUpdates();
    }
  }

  toggleHeadful(): void { this.headful.update((v: boolean) => !v); }
  toggleStealth(): void { this.stealth.update((v: boolean) => !v); }
  toggleDryRun(): void { this.dryRun.update((v: boolean) => !v); }

  async startRun(): Promise<void> {
    await this.runService.start({
      headful: this.headful(),
      stealth: this.stealth(),
      dryRun: this.dryRun()
    });
  }

  async pauseRun(): Promise<void> { await this.runService.pause(); }
  async resumeRun(): Promise<void> { await this.runService.resume(); }
  async stopRun(): Promise<void> { await this.runService.stop(); }
  async submitHumanInput(): Promise<void> { await this.runService.submitHumanInput('continue'); }
  async applyUpdate(): Promise<void> { await this.configService.applyUpdate(); }
}
