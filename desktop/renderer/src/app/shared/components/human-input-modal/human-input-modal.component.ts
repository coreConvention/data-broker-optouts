import { Component, computed, inject } from '@angular/core';
import { ElectronService } from '../../../core/services/electron.service';
import { RunService } from '../../../core/services/run.service';

/**
 * Modal overlay triggered when the engine needs human interaction.
 *
 * Handles CAPTCHA solving, manual steps, and email verification prompts.
 * Supports both legacy string prompts and structured object prompts
 * of the form { type, message, broker, url }.
 */
@Component({
  selector: 'app-human-input-modal',
  standalone: true,
  template: `
    @if (isVisible()) {
      <div class="modal-overlay" (click)="onOverlayClick($event)">
        <div class="modal-content">
          <div class="modal-header">
            <div class="header-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 9v4M12 17h.01"/>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            </div>
            <div class="header-text">
              <h2>Action Required</h2>
              @if (brokerName()) {
                <span class="broker-tag">{{ brokerName() }}</span>
              }
            </div>
          </div>

          <div class="modal-body">
            <pre class="prompt-text">{{ promptMessage() }}</pre>
          </div>

          @if (promptUrl()) {
            <div class="browser-action">
              <button class="btn btn-browser" (click)="openInBrowser()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in Browser
              </button>
              <p class="browser-hint">Complete the steps in your browser, then click Continue below.</p>
            </div>
          }

          <div class="modal-actions">
            <button class="btn btn-skip" (click)="skip()">Skip</button>
            <button class="btn btn-continue" (click)="confirm()">Continue</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Overlay ── */
    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(6px);
      animation: fadeIn 0.2s ease-out both;
    }

    /* ── Modal card ── */
    .modal-content {
      width: 90%;
      max-width: 480px;
      background: var(--bg-card);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-active);
      border-radius: var(--radius-lg);
      box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.5),
        0 0 0 1px var(--border-color),
        0 0 40px var(--color-primary-glow);
      overflow: hidden;
      animation: slideUp 0.3s ease-out both;
    }

    /* ── Header ── */
    .modal-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }

    .header-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-sm);
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
      flex-shrink: 0;
    }

    .header-text {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .header-text h2 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.2;
    }

    .broker-tag {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: var(--color-primary-glow);
      color: var(--color-primary-light);
      width: fit-content;
    }

    /* ── Body ── */
    .modal-body {
      padding: 1.25rem 1.5rem;
    }

    .prompt-text {
      font-family: 'DM Sans', sans-serif;
      font-size: 0.875rem;
      line-height: 1.6;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 0;
    }

    /* ── Browser action ── */
    .browser-action {
      padding: 0 1.5rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .btn-browser {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border: 1px solid var(--border-active);
      border-radius: var(--radius-sm);
      background: var(--color-primary-glow);
      color: var(--color-primary-light);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      width: fit-content;
    }

    .btn-browser:hover {
      background: var(--color-primary-glow-strong);
      box-shadow: 0 0 12px var(--color-primary-glow);
    }

    .browser-hint {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin: 0;
    }

    /* ── Actions bar ── */
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
    }

    .btn-skip {
      padding: 0.5rem 1.25rem;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-skip:hover {
      background: var(--bg-hover);
      border-color: var(--border-active);
      color: var(--text-primary);
    }

    .btn-continue {
      padding: 0.5rem 1.5rem;
      border: none;
      border-radius: var(--radius-sm);
      background: var(--color-primary);
      color: white;
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 0 12px var(--color-primary-glow);
      transition: all 0.2s ease;
    }

    .btn-continue:hover {
      background: var(--color-primary-light);
      box-shadow: 0 0 20px var(--color-primary-glow-strong);
      transform: translateY(-1px);
    }

    .btn-continue:active {
      transform: translateY(0);
    }

    /* ── Animations ── */
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(24px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `]
})
export class HumanInputModalComponent {
  private readonly electronService = inject(ElectronService);
  private readonly runService = inject(RunService);

  /** Whether the modal should be displayed */
  readonly isVisible = computed(() => this.electronService.humanInputPrompt() !== null);

  /** Extract the human-readable message from a string or object prompt */
  readonly promptMessage = computed(() => {
    const prompt = this.electronService.humanInputPrompt();
    if (prompt === null) return '';
    if (typeof prompt === 'string') return prompt;
    return (prompt as Record<string, unknown>)['message'] as string ?? '';
  });

  /** Extract the broker name from an object prompt, or null for string prompts */
  readonly brokerName = computed(() => {
    const prompt = this.electronService.humanInputPrompt();
    if (prompt === null || typeof prompt === 'string') return null;
    return (prompt as Record<string, unknown>)['broker'] as string ?? null;
  });

  /** Extract the URL from an object prompt, or null */
  readonly promptUrl = computed(() => {
    const prompt = this.electronService.humanInputPrompt();
    if (prompt === null || typeof prompt === 'string') return null;
    return (prompt as Record<string, unknown>)['url'] as string ?? null;
  });

  /** Send 'continue' response and dismiss the modal */
  confirm(): void {
    this.runService.submitHumanInput('continue');
  }

  /** Send 'skip' response and dismiss the modal */
  skip(): void {
    this.runService.submitHumanInput('skip');
  }

  /** Open the prompt URL in the system browser */
  openInBrowser(): void {
    const url = this.promptUrl();
    if (url) {
      this.electronService.openExternal(url);
    }
  }

  /** Prevent closing when clicking inside the modal content */
  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      // Clicking the overlay background does nothing; user must choose an action.
      // This is intentional — the engine is paused waiting for a response.
    }
  }
}
