import { Component, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RunService } from '../../core/services/run.service';
import { ConfigService } from '../../core/services/config.service';
import { ElectronService } from '../../core/services/electron.service';
import { ProgressBarComponent } from '../../shared/components/progress-bar/progress-bar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, ProgressBarComponent, StatusBadgeComponent],
  template: `
    <div class="dashboard">
      <header class="dashboard-header">
        <h1>Data Broker Opt-Outs</h1>
        <span class="version">v{{ appVersion() }}</span>
      </header>

      <!-- Quick Stats -->
      <section class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">{{ configService.brokerCount() }}</span>
          <span class="stat-label">Total Brokers</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ runService.getSelectedCount() }}</span>
          <span class="stat-label">Selected</span>
        </div>
        <div class="stat-card success">
          <span class="stat-value">{{ stats().success }}</span>
          <span class="stat-label">Completed</span>
        </div>
        <div class="stat-card warning">
          <span class="stat-value">{{ stats().manual }}</span>
          <span class="stat-label">Manual</span>
        </div>
      </section>

      <!-- Progress Section -->
      @if (isRunning()) {
        <section class="progress-section">
          <h2>Progress</h2>
          <app-progress-bar
            [value]="progressPercent()"
            [label]="progressLabel()"
          />

          <div class="current-broker">
            @if (currentBroker()) {
              <app-status-badge [status]="currentStatus() ?? 'pending'" />
              <span class="broker-name">{{ currentBroker() }}</span>
              @if (currentMessage()) {
                <span class="broker-message">{{ currentMessage() }}</span>
              }
            }
          </div>
        </section>
      }

      <!-- Run Controls -->
      <section class="controls-section">
        <h2>Controls</h2>
        <div class="controls">
          @if (!isRunning()) {
            <button
              class="btn btn-primary"
              (click)="startRun()"
              [disabled]="!canStart()"
            >
              <span class="icon">▶</span>
              Start Opt-Out Process
            </button>
          } @else {
            @if (!isPaused()) {
              <button class="btn btn-warning" (click)="pauseRun()">
                <span class="icon">⏸</span>
                Pause
              </button>
            } @else {
              <button class="btn btn-success" (click)="resumeRun()">
                <span class="icon">▶</span>
                Resume
              </button>
            }
            <button class="btn btn-danger" (click)="stopRun()">
              <span class="icon">⏹</span>
              Stop
            </button>
          }
        </div>

        <div class="run-options">
          <label class="checkbox-label">
            <input
              type="checkbox"
              [checked]="headful()"
              (change)="toggleHeadful()"
              [disabled]="isRunning()"
            />
            Show browser window
          </label>
          <label class="checkbox-label">
            <input
              type="checkbox"
              [checked]="stealth()"
              (change)="toggleStealth()"
              [disabled]="isRunning()"
            />
            Stealth mode
          </label>
          <label class="checkbox-label">
            <input
              type="checkbox"
              [checked]="dryRun()"
              (change)="toggleDryRun()"
              [disabled]="isRunning()"
            />
            Dry run (no submissions)
          </label>
        </div>
      </section>

      <!-- Human Input Modal -->
      @if (humanInputPrompt()) {
        <div class="modal-overlay">
          <div class="modal">
            <h3>Action Required</h3>
            <p>{{ humanInputPrompt() }}</p>
            <div class="modal-actions">
              <button class="btn btn-primary" (click)="submitHumanInput()">
                Continue
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Quick Links -->
      <section class="quick-links">
        <a routerLink="/brokers" class="quick-link">
          <span class="icon">📋</span>
          <span>Manage Brokers</span>
        </a>
        <a routerLink="/profile" class="quick-link">
          <span class="icon">👤</span>
          <span>Edit Profile</span>
        </a>
        <a routerLink="/logs" class="quick-link">
          <span class="icon">📝</span>
          <span>View Logs</span>
        </a>
        <a routerLink="/settings" class="quick-link">
          <span class="icon">⚙️</span>
          <span>Settings</span>
        </a>
      </section>

      <!-- Manifest Update Banner -->
      @if (manifestUpdate()) {
        <div class="update-banner">
          <span>
            New broker list available!
            {{ manifestUpdate()!.added.length }} added,
            {{ manifestUpdate()!.removed.length }} removed
          </span>
          <button class="btn btn-sm" (click)="applyUpdate()">
            Update Now
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .dashboard {
      padding: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;

      h1 {
        margin: 0;
        font-size: 1.75rem;
        color: var(--text-primary);
      }

      .version {
        color: var(--text-secondary);
        font-size: 0.875rem;
      }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--bg-card);
      border-radius: 8px;
      padding: 1.25rem;
      text-align: center;
      border: 1px solid var(--border-color);

      .stat-value {
        display: block;
        font-size: 2rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .stat-label {
        display: block;
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }

      &.success .stat-value { color: var(--color-success); }
      &.warning .stat-value { color: var(--color-warning); }
      &.danger .stat-value { color: var(--color-danger); }
    }

    .progress-section, .controls-section {
      background: var(--bg-card);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      border: 1px solid var(--border-color);

      h2 {
        margin: 0 0 1rem 0;
        font-size: 1.125rem;
        color: var(--text-primary);
      }
    }

    .current-broker {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1rem;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border-radius: 4px;

      .broker-name {
        font-weight: 500;
      }

      .broker-message {
        color: var(--text-secondary);
        font-size: 0.875rem;
      }
    }

    .controls {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .run-options {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem;

      input[type="checkbox"] {
        width: 1rem;
        height: 1rem;
      }
    }

    .quick-links {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
    }

    .quick-link {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--bg-card);
      border-radius: 8px;
      text-decoration: none;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      transition: all 0.2s;

      &:hover {
        border-color: var(--color-primary);
        transform: translateY(-2px);
      }

      .icon {
        font-size: 1.5rem;
      }
    }

    .update-banner {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.5rem;
      background: var(--color-primary);
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 2rem;
      max-width: 400px;
      width: 90%;

      h3 {
        margin: 0 0 1rem 0;
      }

      p {
        margin: 0 0 1.5rem 0;
        color: var(--text-secondary);
      }
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .icon {
        font-size: 0.875rem;
      }
    }

    .btn-primary {
      background: var(--color-primary);
      color: white;

      &:hover:not(:disabled) {
        background: var(--color-primary-dark);
      }
    }

    .btn-success {
      background: var(--color-success);
      color: white;
    }

    .btn-warning {
      background: var(--color-warning);
      color: white;
    }

    .btn-danger {
      background: var(--color-danger);
      color: white;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
    }
  `]
})
export class DashboardComponent implements OnInit {
  protected runService = inject(RunService);
  protected configService = inject(ConfigService);
  private electronService = inject(ElectronService);

  // State
  protected appVersion = signal('1.0.0');
  protected headful = signal(true);
  protected stealth = signal(true);
  protected dryRun = signal(false);

  // Computed from services
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

  async ngOnInit(): Promise<void> {
    // Load configuration
    await this.configService.loadAll();

    // Load settings into local state
    const settings = this.configService.settings();
    if (settings) {
      this.headful.set(settings.headful);
      this.stealth.set(settings.stealth);
    }

    // Get app version
    this.appVersion.set(await this.electronService.getAppVersion());

    // Check for manifest updates
    if (this.configService.settings()?.autoCheckManifestUpdates) {
      await this.configService.checkForUpdates();
    }
  }

  toggleHeadful(): void {
    this.headful.update(v => !v);
  }

  toggleStealth(): void {
    this.stealth.update(v => !v);
  }

  toggleDryRun(): void {
    this.dryRun.update(v => !v);
  }

  async startRun(): Promise<void> {
    await this.runService.start({
      headful: this.headful(),
      stealth: this.stealth(),
      dryRun: this.dryRun()
    });
  }

  async pauseRun(): Promise<void> {
    await this.runService.pause();
  }

  async resumeRun(): Promise<void> {
    await this.runService.resume();
  }

  async stopRun(): Promise<void> {
    await this.runService.stop();
  }

  async submitHumanInput(): Promise<void> {
    await this.runService.submitHumanInput('continue');
  }

  async applyUpdate(): Promise<void> {
    await this.configService.applyUpdate();
  }
}
