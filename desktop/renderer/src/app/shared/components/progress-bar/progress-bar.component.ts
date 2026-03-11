import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-wrap">
      <div class="progress-track">
        <div
          class="progress-fill"
          [style.width.%]="value"
          [class.animated]="animated"
        ></div>
      </div>
      @if (label) {
        <div class="progress-meta">
          <span class="mono">{{ label }}</span>
          <span class="percent mono">{{ value }}%</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .progress-wrap { width: 100%; }

    .progress-track {
      height: 6px;
      background: var(--bg-secondary);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--color-primary);
      border-radius: 3px;
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;

      &.animated {
        background: linear-gradient(
          90deg,
          var(--color-primary) 0%,
          var(--color-primary-light) 50%,
          var(--color-primary) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 2s infinite;
      }
    }

    .progress-meta {
      display: flex;
      justify-content: space-between;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .percent {
      color: var(--color-primary);
      font-weight: 600;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class ProgressBarComponent {
  @Input() value = 0;
  @Input() label = '';
  @Input() animated = true;
}
