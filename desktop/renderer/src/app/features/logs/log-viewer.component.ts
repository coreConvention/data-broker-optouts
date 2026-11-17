import { Component, inject, computed, signal, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RunService } from '../../core/services/run.service';
import { ElectronService } from '../../core/services/electron.service';

@Component({
  selector: 'app-log-viewer',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="log-viewer-page">
      <header class="page-header">
        <div class="header-content">
          <h1>Run Logs</h1>
          <p class="subtitle">{{ logCount() }} log entries</p>
        </div>
        <div class="header-actions">
          <button
            class="btn btn-secondary"
            (click)="copyLogs()"
            [disabled]="logCount() === 0"
          >
            Copy to Clipboard
          </button>
          <button
            class="btn btn-secondary"
            (click)="clearLogs()"
            [disabled]="logCount() === 0"
          >
            Clear Logs
          </button>
        </div>
      </header>

      <div class="log-controls">
        <label class="checkbox-label">
          <input
            type="checkbox"
            [(ngModel)]="autoScroll"
            (change)="onAutoScrollChange()"
          />
          Auto-scroll to bottom
        </label>

        <label class="checkbox-label">
          <input
            type="checkbox"
            [(ngModel)]="showTimestamps"
          />
          Show timestamps
        </label>
      </div>

      <div
        class="log-container"
        #logContainer
        [class.empty]="logCount() === 0"
      >
        @if (logCount() > 0) {
          @for (log of logs(); track $index) {
            <div class="log-entry" [class]="getLogClass(log)">
              @if (showTimestamps) {
                <span class="log-timestamp">{{ extractTimestamp(log) }}</span>
              }
              <span class="log-message">{{ extractMessage(log) }}</span>
            </div>
          }
        } @else {
          <div class="empty-state">
            <p>No logs yet. Start an opt-out run to see logs here.</p>
            <a routerLink="/" class="btn btn-primary">Go to Dashboard</a>
          </div>
        }
      </div>

      <!-- Status Bar -->
      <div class="status-bar">
        @if (isRunning()) {
          <span class="status running">
            <span class="pulse"></span>
            Running...
          </span>
        } @else {
          <span class="status idle">Idle</span>
        }

        <span class="log-count">{{ logCount() }} entries</span>
      </div>

      <!-- Back to Dashboard -->
      <div class="page-footer">
        <a routerLink="/" class="btn btn-secondary">← Back to Dashboard</a>
      </div>
    </div>
  `,
  styles: [`
    .log-viewer-page {
      padding: 2rem;
      max-width: 1000px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      height: calc(100vh - 4rem);
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      gap: 1rem;

      .header-content {
        h1 { margin: 0 0 0.25rem 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
        .subtitle { margin: 0; color: var(--text-secondary); font-size: 0.8125rem; }
      }
      .header-actions { display: flex; gap: 0.5rem; }
    }

    .log-controls {
      display: flex;
      gap: 1.25rem;
      margin-bottom: 0.75rem;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
      cursor: pointer;

      input {
        appearance: none;
        width: 0.875rem;
        height: 0.875rem;
        border: 1.5px solid var(--border-color);
        border-radius: 3px;
        background: var(--bg-input);
        cursor: pointer;
        display: grid;
        place-content: center;

        &::before {
          content: '';
          width: 0.5rem;
          height: 0.5rem;
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

    .log-container {
      flex: 1;
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 1rem;
      overflow-y: auto;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 0.75rem;
      line-height: 1.7;

      &.empty {
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }

    .log-entry {
      padding: 0.2rem 0;

      &.log-error { color: #ef4444; }
      &.log-success { color: #10b981; }
      &.log-warning { color: #f59e0b; }
      &.log-info { color: var(--text-primary); }
    }

    .log-timestamp { color: var(--text-muted); margin-right: 0.75rem; }

    .log-message { white-space: pre-wrap; word-break: break-word; }

    .empty-state {
      text-align: center;
      color: var(--text-secondary);
      p { margin-bottom: 1rem; }
    }

    .status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      margin-top: 0.75rem;
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;

      .status {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        &.running { color: var(--color-success); }
        &.idle { color: var(--text-muted); }
      }

      .pulse {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--color-success);
        animation: pulse 1.5s infinite;
      }

      .log-count { color: var(--text-muted); }
    }

    .page-footer { display: none; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `]
})
export class LogViewerComponent implements AfterViewChecked {
  private runService = inject(RunService);
  private electronService = inject(ElectronService);

  @ViewChild('logContainer') logContainer!: ElementRef<HTMLDivElement>;

  protected autoScroll = true;
  protected showTimestamps = true;
  private shouldScroll = false;

  protected logs = this.runService.logs;
  protected isRunning = this.runService.isRunning;
  protected logCount = computed(() => this.logs().length);

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.autoScroll && this.logContainer) {
      const container = this.logContainer.nativeElement;
      container.scrollTop = container.scrollHeight;
      this.shouldScroll = false;
    }
  }

  onAutoScrollChange(): void {
    if (this.autoScroll) {
      this.shouldScroll = true;
    }
  }

  extractTimestamp(log: string): string {
    const match = log.match(/^\[([^\]]+)\]/);
    return match ? match[1] ?? '' : '';
  }

  extractMessage(log: string): string {
    return log.replace(/^\[[^\]]+\]\s*/, '');
  }

  getLogClass(log: string): string {
    const lower = log.toLowerCase();
    if (lower.includes('error') || lower.includes('failed')) return 'log-error';
    if (lower.includes('success') || lower.includes('completed')) return 'log-success';
    if (lower.includes('warning') || lower.includes('skipped')) return 'log-warning';
    return 'log-info';
  }

  async copyLogs(): Promise<void> {
    const text = this.logs().join('\n');
    await navigator.clipboard.writeText(text);
  }

  clearLogs(): void {
    this.runService.clearLogs();
  }
}
