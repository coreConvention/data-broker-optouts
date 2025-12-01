import { Component, Input, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatusType = 'pending' | 'processing' | 'captcha' | 'manual' | 'success' | 'failed' | 'skipped';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="status-badge"
      [class]="'status-' + status"
      [title]="statusTitle()"
    >
      <span class="status-icon">{{ statusIcon() }}</span>
      @if (showLabel) {
        <span class="status-label">{{ statusLabel() }}</span>
      }
    </span>
  `,
  styles: [`
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-icon {
      font-size: 0.875rem;
    }

    .status-pending {
      background: var(--bg-secondary);
      color: var(--text-secondary);
    }

    .status-processing {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }

    .status-captcha {
      background: rgba(249, 115, 22, 0.1);
      color: #f97316;
    }

    .status-manual {
      background: rgba(234, 179, 8, 0.1);
      color: #eab308;
    }

    .status-success {
      background: rgba(34, 197, 94, 0.1);
      color: #22c55e;
    }

    .status-failed {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }

    .status-skipped {
      background: rgba(107, 114, 128, 0.1);
      color: #6b7280;
    }
  `]
})
export class StatusBadgeComponent {
  @Input() status: StatusType = 'pending';
  @Input() showLabel = false;

  protected statusIcon = computed(() => {
    const icons: Record<StatusType, string> = {
      pending: '○',
      processing: '⏳',
      captcha: '🔐',
      manual: '👆',
      success: '✓',
      failed: '✗',
      skipped: '⊘'
    };
    return icons[this.status];
  });

  protected statusLabel = computed(() => {
    const labels: Record<StatusType, string> = {
      pending: 'Pending',
      processing: 'Processing',
      captcha: 'CAPTCHA',
      manual: 'Manual',
      success: 'Success',
      failed: 'Failed',
      skipped: 'Skipped'
    };
    return labels[this.status];
  });

  protected statusTitle = computed(() => {
    const titles: Record<StatusType, string> = {
      pending: 'Waiting to be processed',
      processing: 'Currently being processed',
      captcha: 'Waiting for CAPTCHA to be solved',
      manual: 'Requires manual intervention',
      success: 'Completed successfully',
      failed: 'Failed to complete',
      skipped: 'Skipped'
    };
    return titles[this.status];
  });
}
