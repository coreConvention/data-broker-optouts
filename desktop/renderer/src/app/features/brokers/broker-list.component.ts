import { Component, inject, OnInit, signal, computed } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { RunService } from '../../core/services/run.service';
import { Broker } from '../../core/services/electron.service';
import { StatusBadgeComponent, StatusType } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-broker-list',
  standalone: true,
  imports: [FormsModule, RouterLink, StatusBadgeComponent],
  template: `
    <div class="broker-list-page">
      <header class="page-header">
        <div class="header-content">
          <h1>Data Brokers</h1>
          <p class="subtitle">{{ brokerCount() }} brokers configured</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="selectAll()">
            Select All
          </button>
          <button class="btn btn-secondary" (click)="deselectAll()">
            Deselect All
          </button>
        </div>
      </header>

      <!-- Filters -->
      <div class="filters">
        <div class="search-box">
          <input
            type="text"
            [(ngModel)]="searchQuery"
            placeholder="Search brokers..."
            (input)="onSearch()"
          />
        </div>

        <select [(ngModel)]="requirementFilter" (change)="onFilterChange()">
          <option value="">All Requirements</option>
          <option value="online">Online Form</option>
          <option value="captcha">CAPTCHA</option>
          <option value="email-verification">Email Verification</option>
          <option value="email-only">Email Only</option>
          <option value="phone-verification">Phone Verification</option>
          <option value="account-required">Account Required</option>
        </select>

        <div class="selected-count">
          {{ selectedCount() }} selected
        </div>
      </div>

      <!-- Broker Grid -->
      <div class="broker-grid">
        @for (broker of filteredBrokers(); track broker.name) {
          <div
            class="broker-card"
            [class.selected]="isSelected(broker.name)"
            (click)="toggleBroker(broker.name)"
          >
            <div class="broker-header">
              <input
                type="checkbox"
                [checked]="isSelected(broker.name)"
                (click)="$event.stopPropagation()"
                (change)="toggleBroker(broker.name)"
              />
              <h3>{{ broker.name }}</h3>
            </div>

            <div class="broker-requirements">
              @for (req of broker.requirements; track req) {
                <span class="requirement-tag" [class]="'req-' + req">
                  {{ formatRequirement(req) }}
                </span>
              }
            </div>

            @if (broker.notes) {
              <p class="broker-notes">{{ broker.notes }}</p>
            }

            <div class="broker-footer">
              <a
                [href]="broker.removalUrl"
                target="_blank"
                class="broker-link"
                (click)="$event.stopPropagation(); openUrl(broker.removalUrl)"
              >
                View Form →
              </a>
              @if (getBrokerStatus(broker.name); as status) {
                <app-status-badge [status]="status" [showLabel]="true" />
              }
            </div>
          </div>
        } @empty {
          <div class="empty-state">
            @if (searchQuery || requirementFilter) {
              <p>No brokers match your search criteria.</p>
              <button class="btn btn-secondary" (click)="clearFilters()">
                Clear Filters
              </button>
            } @else {
              <p>No brokers configured. Check your manifest.json file.</p>
            }
          </div>
        }
      </div>

      <!-- Back to Dashboard -->
      <div class="page-footer">
        <a routerLink="/" class="btn btn-secondary">← Back to Dashboard</a>
      </div>
    </div>
  `,
  styles: [`
    .broker-list-page {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;

      .header-content {
        h1 { margin: 0 0 0.25rem 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
        .subtitle { margin: 0; color: var(--text-secondary); font-size: 0.8125rem; }
      }

      .header-actions { display: flex; gap: 0.5rem; }
    }

    .filters {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      align-items: center;

      .search-box {
        flex: 1;
        min-width: 200px;

        input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          background: var(--bg-input);
          color: var(--text-primary);
          transition: border-color 0.2s, box-shadow 0.2s;

          &:focus {
            outline: none;
            border-color: var(--color-primary);
            box-shadow: 0 0 0 3px var(--color-primary-glow);
          }
          &::placeholder { color: var(--text-muted); }
        }
      }

      select {
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-size: 0.8125rem;
        background: var(--bg-input);
        color: var(--text-primary);
      }

      .selected-count {
        padding: 0.5rem 0.75rem;
        background: var(--color-primary-glow);
        color: var(--color-primary);
        border: 1px solid var(--border-active);
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
        font-weight: 600;
        font-family: 'JetBrains Mono', monospace;
      }
    }

    .broker-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 0.75rem;
    }

    .broker-card {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 1rem;
      cursor: pointer;
      transition: all 0.25s;

      &:hover { border-color: var(--border-active); }

      &.selected {
        border-color: var(--color-primary);
        box-shadow: 0 0 12px var(--color-primary-glow);
        background: rgba(14, 165, 233, 0.04);
      }

      .broker-header {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        margin-bottom: 0.625rem;

        input[type="checkbox"] {
          appearance: none;
          width: 1rem;
          height: 1rem;
          border: 1.5px solid var(--border-color);
          border-radius: 3px;
          background: var(--bg-input);
          cursor: pointer;
          transition: all 0.15s;
          display: grid;
          place-content: center;

          &::before {
            content: '';
            width: 0.55rem;
            height: 0.55rem;
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

        h3 { margin: 0; font-size: 0.875rem; font-weight: 600; }
      }

      .broker-requirements {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        margin-bottom: 0.625rem;
      }

      .requirement-tag {
        padding: 0.1rem 0.4rem;
        border-radius: 3px;
        font-size: 0.5625rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-family: 'JetBrains Mono', monospace;

        &.req-online { background: rgba(16,185,129,0.1); color: #10b981; }
        &.req-captcha { background: rgba(245,158,11,0.1); color: #f59e0b; }
        &.req-email-verification { background: rgba(14,165,233,0.1); color: #38bdf8; }
        &.req-email-only { background: rgba(139,92,246,0.1); color: #a78bfa; }
        &.req-phone-verification { background: rgba(236,72,153,0.1); color: #ec4899; }
        &.req-account-required { background: rgba(136,146,176,0.1); color: var(--text-secondary); }
        &.req-id-verification { background: rgba(239,68,68,0.1); color: #ef4444; }
        &.req-id-upload { background: rgba(239,68,68,0.1); color: #ef4444; }
      }

      .broker-notes {
        margin: 0 0 0.625rem 0;
        font-size: 0.6875rem;
        color: var(--text-muted);
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .broker-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .broker-link {
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--text-accent);
        text-decoration: none;
        &:hover { text-decoration: underline; }
      }
    }

    .empty-state {
      grid-column: 1 / -1;
      text-align: center;
      padding: 3rem;
      color: var(--text-secondary);
      p { margin-bottom: 1rem; }
    }

    .page-footer { display: none; }
  `]
})
export class BrokerListComponent implements OnInit {
  private configService = inject(ConfigService);
  private runService = inject(RunService);

  protected searchQuery = '';
  protected requirementFilter = '';

  protected brokerCount = computed(() => this.configService.brokerCount());
  protected selectedCount = computed(() => this.runService.getSelectedCount());

  private allBrokers = signal<Broker[]>([]);

  protected filteredBrokers = computed(() => {
    let brokers = this.allBrokers();

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      brokers = brokers.filter(b =>
        b.name.toLowerCase().includes(query)
      );
    }

    if (this.requirementFilter) {
      brokers = brokers.filter(b =>
        b.requirements.includes(this.requirementFilter)
      );
    }

    return brokers;
  });

  async ngOnInit(): Promise<void> {
    await this.configService.loadAll();
    this.allBrokers.set(this.configService.brokers());
  }

  onSearch(): void {
    // Filtering is handled by computed
  }

  onFilterChange(): void {
    // Filtering is handled by computed
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.requirementFilter = '';
  }

  isSelected(name: string): boolean {
    return this.runService.isSelected(name);
  }

  toggleBroker(name: string): void {
    this.runService.toggleBroker(name);
  }

  selectAll(): void {
    this.runService.selectAll(this.filteredBrokers());
  }

  deselectAll(): void {
    this.runService.deselectAll();
  }

  getBrokerStatus(name: string): StatusType | null {
    const status = this.runService.getBrokerStatus(name);
    return (status?.status as StatusType) ?? null;
  }

  formatRequirement(req: string): string {
    return req.replace(/-/g, ' ');
  }

  openUrl(url: string): void {
    // In Electron, this will use shell.openExternal
    window.open(url, '_blank');
  }
}
