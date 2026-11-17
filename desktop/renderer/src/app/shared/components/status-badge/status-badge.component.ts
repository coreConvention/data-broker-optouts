import { Component, Input, computed, input } from '@angular/core';


export type StatusType = 'pending' | 'processing' | 'captcha' | 'manual' | 'success' | 'failed' | 'skipped';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [],
  template: `
    <span
      class="badge"
      [class]="'badge-' + status"
      [title]="statusTitle()"
    >
      <span class="icon">{{ statusIcon() }}</span>
      @if (showLabel) {
        <span class="label">{{ statusLabel() }}</span>
      }
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: 'JetBrains Mono', monospace;
    }

    .icon { font-size: 0.75rem; }

    .badge-pending   { background: rgba(136,146,176,0.1); color: var(--text-muted); }
    .badge-processing{ background: rgba(14,165,233,0.12);  color: #38bdf8; }
    .badge-captcha   { background: rgba(245,158,11,0.12);  color: #f59e0b; }
    .badge-manual    { background: rgba(139,92,246,0.12);   color: #a78bfa; }
    .badge-success   { background: rgba(16,185,129,0.12);   color: #10b981; }
    .badge-failed    { background: rgba(239,68,68,0.12);    color: #ef4444; }
    .badge-skipped   { background: rgba(136,146,176,0.1);  color: var(--text-secondary); }
  `]
})
export class StatusBadgeComponent {
  @Input() status: StatusType = 'pending';
  @Input() showLabel = false;

  protected statusIcon = computed(() => {
    const icons: Record<StatusType, string> = {
      pending: '○', processing: '◌', captcha: '◈',
      manual: '◇', success: '●', failed: '✕', skipped: '⊘'
    };
    return icons[this.status];
  });

  protected statusLabel = computed(() => {
    const labels: Record<StatusType, string> = {
      pending: 'Pending', processing: 'Processing', captcha: 'CAPTCHA',
      manual: 'Manual', success: 'Success', failed: 'Failed', skipped: 'Skipped'
    };
    return labels[this.status];
  });

  protected statusTitle = computed(() => {
    const titles: Record<StatusType, string> = {
      pending: 'Waiting to be processed', processing: 'Currently being processed',
      captcha: 'Waiting for CAPTCHA', manual: 'Requires manual intervention',
      success: 'Completed successfully', failed: 'Failed to complete', skipped: 'Skipped'
    };
    return titles[this.status];
  });
}
