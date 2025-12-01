import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-bar-container">
      <div class="progress-bar">
        <div
          class="progress-fill"
          [style.width.%]="value"
          [class.animated]="animated"
        ></div>
      </div>
      @if (label) {
        <div class="progress-label">
          <span>{{ label }}</span>
          <span class="progress-percent">{{ value }}%</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .progress-bar-container {
      width: 100%;
    }

    .progress-bar {
      height: 8px;
      background: var(--bg-secondary);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--color-primary);
      border-radius: 4px;
      transition: width 0.3s ease;

      &.animated {
        background: linear-gradient(
          90deg,
          var(--color-primary) 0%,
          var(--color-primary-light) 50%,
          var(--color-primary) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
      }
    }

    .progress-label {
      display: flex;
      justify-content: space-between;
      margin-top: 0.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .progress-percent {
      font-weight: 500;
      color: var(--text-primary);
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
