import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { HumanInputModalComponent } from './shared/components/human-input-modal/human-input-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, HumanInputModalComponent],
  template: `
    <div class="app-shell">
      <!-- Sidebar Navigation -->
      <nav class="sidebar">
        <div class="sidebar-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="currentColor" stroke-width="1.5" fill="rgba(14,165,233,0.1)"/>
            <path d="M12 8a2 2 0 100 4 2 2 0 000-4z" stroke="currentColor" stroke-width="1.5"/>
            <path d="M12 12v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>

        <div class="nav-links">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}"
             class="nav-item" title="Dashboard">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </a>

          <a routerLink="/brokers" routerLinkActive="active"
             class="nav-item" title="Brokers">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
          </a>

          <a routerLink="/profile" routerLinkActive="active"
             class="nav-item" title="Profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="8" r="4"/>
              <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/>
            </svg>
          </a>

          <a routerLink="/logs" routerLinkActive="active"
             class="nav-item" title="Logs">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 6h16M4 10h16M4 14h10M4 18h7"/>
            </svg>
          </a>

          <a routerLink="/settings" routerLinkActive="active"
             class="nav-item" title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </a>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="main-content">
        <router-outlet />
      </main>
    </div>
    <app-human-input-modal />
  `,
  styles: [`
    .app-shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    .sidebar {
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
      background: var(--bg-primary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem 0;
      gap: 0.25rem;
      -webkit-app-region: drag;
    }

    .sidebar-logo {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-primary);
      margin-bottom: 1.5rem;
      -webkit-app-region: no-drag;
    }

    .nav-links {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      -webkit-app-region: no-drag;
    }

    .nav-item {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
      color: var(--text-muted);
      transition: all 0.2s ease;
      text-decoration: none;
      position: relative;

      &:hover {
        color: var(--text-primary);
        background: var(--bg-hover);
        text-decoration: none;
      }

      &.active {
        color: var(--color-primary);
        background: var(--color-primary-glow);

        &::before {
          content: '';
          position: absolute;
          left: -8px;
          width: 3px;
          height: 20px;
          background: var(--color-primary);
          border-radius: 0 2px 2px 0;
        }
      }
    }

    .main-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      background: var(--bg-body);
    }
  `]
})
export class AppComponent {}
