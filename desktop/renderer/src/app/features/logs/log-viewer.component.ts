import { Component, inject, computed, signal, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RunService } from '../../core/services/run.service';
import { ElectronService } from '../../core/services/electron.service';

@Component({
  selector: 'app-log-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
      padding: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      height: calc(100vh - 3rem);
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      gap: 1rem;

      .header-content {
        h1 {
          margin: 0 0 0.25rem 0;
          font-size: 1.5rem;
        }

        .subtitle {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
      }

      .header-actions {
        display: flex;
        gap: 0.5rem;
      }
    }

    .log-controls {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 1rem;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      cursor: pointer;

      input {
        width: 1rem;
        height: 1rem;
      }
    }

    .log-container {
      flex: 1;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem;
      overflow-y: auto;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.8125rem;
      line-height: 1.6;

      &.empty {
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }

    .log-entry {
      padding: 0.25rem 0;
      border-bottom: 1px solid var(--border-color);

      &:last-child {
        border-bottom: none;
      }

      &.log-error {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.05);
        margin: 0 -1rem;
        padding: 0.25rem 1rem;
      }

      &.log-success {
        color: #22c55e;
      }

      &.log-warning {
        color: #f97316;
      }

      &.log-info {
        color: var(--text-primary);
      }
    }

    .log-timestamp {
      color: var(--text-secondary);
      margin-right: 0.75rem;
    }

    .log-message {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .empty-state {
      text-align: center;
      color: var(--text-secondary);

      p {
        margin-bottom: 1rem;
      }
    }

    .status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-top: 1rem;
      font-size: 0.875rem;

      .status {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        &.running {
          color: var(--color-success);
        }

        &.idle {
          color: var(--text-secondary);
        }
      }

      .pulse {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-success);
        animation: pulse 1.5s infinite;
      }

      .log-count {
        color: var(--text-secondary);
      }
    }

    .page-footer {
      margin-top: 1rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background: var(--color-primary);
      color: white;

      &:hover:not(:disabled) {
        background: var(--color-primary-dark);
      }
    }

    .btn-secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);

      &:hover:not(:disabled) {
        background: var(--bg-hover);
      }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
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
