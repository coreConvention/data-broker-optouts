import { Component, inject, OnInit, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { ElectronService, Settings } from '../../core/services/electron.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="settings-page">
      <header class="page-header">
        <h1>Settings</h1>
        <p class="subtitle">Configure application preferences</p>
      </header>

      @if (isLoading()) {
        <div class="loading">Loading settings...</div>
      } @else {
        <div class="settings-sections">
          <!-- Run Settings -->
          <section class="settings-section">
            <h2>Run Preferences</h2>

            <div class="setting-item">
              <div class="setting-info">
                <label>Show Browser Window</label>
                <p>Display the browser during opt-out process</p>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  [(ngModel)]="settings.headful"
                  (change)="onSettingChange()"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label>Stealth Mode</label>
                <p>Use anti-detection techniques to avoid bot detection</p>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  [(ngModel)]="settings.stealth"
                  (change)="onSettingChange()"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </section>

          <!-- Updates -->
          <section class="settings-section">
            <h2>Updates</h2>

            <div class="setting-item">
              <div class="setting-info">
                <label>Auto-check for Manifest Updates</label>
                <p>Check for new broker list when app starts</p>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  [(ngModel)]="settings.autoCheckManifestUpdates"
                  (change)="onSettingChange()"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-item action-item">
              <div class="setting-info">
                <label>Check for Updates Now</label>
                <p>Manually check for broker list updates</p>
              </div>
              <button
                class="btn btn-secondary"
                (click)="checkForUpdates()"
                [disabled]="isChecking()"
              >
                {{ isChecking() ? 'Checking...' : 'Check Now' }}
              </button>
            </div>

            @if (updateStatus()) {
              <div class="update-result" [class.has-update]="hasUpdate()">
                {{ updateStatus() }}
              </div>
            }
          </section>

          <!-- Appearance -->
          <section class="settings-section">
            <h2>Appearance</h2>

            <div class="setting-item">
              <div class="setting-info">
                <label>Theme</label>
                <p>Choose your preferred color theme</p>
              </div>
              <select
                [(ngModel)]="settings.theme"
                (change)="onSettingChange()"
              >
                <option value="system">System Default</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </section>

          <!-- Data -->
          <section class="settings-section">
            <h2>Data</h2>

            <div class="setting-item">
              <div class="setting-info">
                <label>Data Directory</label>
                <p>{{ dataPath() || 'Loading...' }}</p>
              </div>
              <button
                class="btn btn-secondary"
                (click)="openDataFolder()"
              >
                Open Folder
              </button>
            </div>
          </section>

          <!-- About -->
          <section class="settings-section">
            <h2>About</h2>

            <div class="about-info">
              <div class="about-row">
                <span class="label">Version</span>
                <span class="value">{{ appVersion() }}</span>
              </div>
              <div class="about-row">
                <span class="label">Brokers Configured</span>
                <span class="value">{{ brokerCount() }}</span>
              </div>
              <div class="about-row">
                <span class="label">Platform</span>
                <span class="value">{{ platform }}</span>
              </div>
            </div>

            <div class="about-links">
              <a href="#" (click)="openGitHub($event)">View on GitHub</a>
              <span class="separator">•</span>
              <a href="#" (click)="openIssues($event)">Report Issue</a>
            </div>
          </section>
        </div>

        <!-- Save Status -->
        @if (saveMessage()) {
          <div class="save-message" [class.error]="saveError()">
            {{ saveMessage() }}
          </div>
        }
      }

      <!-- Back to Dashboard -->
      <div class="page-footer">
        <a routerLink="/" class="btn btn-secondary">← Back to Dashboard</a>
      </div>
    </div>
  `,
  styles: [`
    .settings-page {
      padding: 2rem;
      max-width: 700px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 2rem;
      h1 { margin: 0 0 0.25rem 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
      .subtitle { margin: 0; color: var(--text-secondary); font-size: 0.8125rem; }
    }

    .settings-sections {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .settings-section {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      box-shadow: var(--shadow-card);

      h2 {
        margin: 0 0 0.75rem 0;
        font-size: 0.6875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
        padding-bottom: 0.625rem;
        border-bottom: 1px solid var(--border-color);
      }
    }

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.625rem 0;

      &:first-of-type { padding-top: 0; }

      .setting-info {
        flex: 1;
        label { display: block; font-weight: 500; font-size: 0.8125rem; margin-bottom: 0.125rem; }
        p { margin: 0; font-size: 0.6875rem; color: var(--text-muted); }
      }

      select {
        padding: 0.375rem 0.625rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-size: 0.8125rem;
        background: var(--bg-input);
        color: var(--text-primary);
      }
    }

    .toggle {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
      cursor: pointer;

      input {
        opacity: 0;
        width: 0;
        height: 0;

        &:checked + .toggle-slider {
          background: var(--color-primary);
          border-color: var(--color-primary);
          &::before { transform: translateX(18px); }
        }
      }

      .toggle-slider {
        position: absolute;
        inset: 0;
        background: var(--bg-secondary);
        border-radius: 22px;
        transition: 0.25s ease;
        border: 1px solid var(--border-color);

        &::before {
          content: '';
          position: absolute;
          height: 16px;
          width: 16px;
          left: 2px;
          bottom: 2px;
          background: var(--text-primary);
          border-radius: 50%;
          transition: 0.25s ease;
        }
      }
    }

    .update-result {
      margin-top: 0.75rem;
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      &.has-update { background: var(--color-success-glow); color: var(--color-success); }
    }

    .about-info { margin-bottom: 0.75rem; }

    .about-row {
      display: flex;
      justify-content: space-between;
      padding: 0.375rem 0;
      font-size: 0.8125rem;
      .label { color: var(--text-muted); }
      .value { color: var(--text-primary); font-weight: 500; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
    }

    .about-links {
      font-size: 0.8125rem;
      a { color: var(--text-accent); text-decoration: none; &:hover { text-decoration: underline; } }
      .separator { margin: 0 0.5rem; color: var(--text-muted); }
    }

    .save-message {
      margin-top: 1rem;
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      background: var(--color-success-glow);
      color: var(--color-success);
      &.error { background: var(--color-danger-glow); color: var(--color-danger); }
    }

    .page-footer { display: none; }
    .loading { text-align: center; padding: 3rem; color: var(--text-secondary); }
  `]
})
export class SettingsComponent implements OnInit {
  private configService = inject(ConfigService);
  private electronService = inject(ElectronService);

  protected settings: Settings = {
    headful: true,
    stealth: true,
    autoCheckManifestUpdates: true,
    theme: 'system'
  };

  protected isLoading = signal(true);
  protected isChecking = signal(false);
  protected saveMessage = signal('');
  protected saveError = signal(false);
  protected updateStatus = signal('');
  protected hasUpdate = signal(false);
  protected dataPath = signal('');
  protected appVersion = signal('1.0.0');
  protected brokerCount = signal(0);

  protected platform = navigator.platform;

  async ngOnInit(): Promise<void> {
    try {
      await this.configService.loadAll();

      const settings = this.configService.settings();
      if (settings) {
        this.settings = { ...settings };
      }

      this.dataPath.set(await this.electronService.getDataPath());
      this.appVersion.set(await this.electronService.getAppVersion());
      this.brokerCount.set(this.configService.brokerCount());
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSettingChange(): Promise<void> {
    this.saveMessage.set('');
    this.saveError.set(false);

    try {
      await this.configService.saveSettings(this.settings);
      this.saveMessage.set('Settings saved');
      setTimeout(() => this.saveMessage.set(''), 2000);
    } catch (error) {
      this.saveError.set(true);
      this.saveMessage.set('Failed to save settings');
    }
  }

  async checkForUpdates(): Promise<void> {
    this.isChecking.set(true);
    this.updateStatus.set('');
    this.hasUpdate.set(false);

    try {
      const info = await this.electronService.checkManifestUpdates();

      if (info) {
        this.hasUpdate.set(true);
        this.updateStatus.set(
          `Update available! ${info.added.length} new brokers, ${info.removed.length} removed.`
        );
      } else {
        this.updateStatus.set('Your broker list is up to date.');
      }
    } catch (error) {
      this.updateStatus.set('Failed to check for updates. Please try again later.');
    } finally {
      this.isChecking.set(false);
    }
  }

  async openDataFolder(): Promise<void> {
    const path = this.dataPath();
    if (path) {
      await this.electronService.showInFolder(path);
    }
  }

  openGitHub(event: Event): void {
    event.preventDefault();
    this.electronService.openExternal('https://github.com/YOUR_USERNAME/data-broker-optouts');
  }

  openIssues(event: Event): void {
    event.preventDefault();
    this.electronService.openExternal('https://github.com/YOUR_USERNAME/data-broker-optouts/issues');
  }
}
