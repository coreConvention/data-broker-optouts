import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { RunService } from '../../core/services/run.service';
import { Broker } from '../../core/services/electron.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-broker-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StatusBadgeComponent],
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
      padding: 1.5rem;
      max-width: 1400px;
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

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      align-items: center;

      .search-box {
        flex: 1;
        min-width: 200px;

        input {
          width: 100%;
          padding: 0.625rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 0.875rem;
          background: var(--bg-input);
          color: var(--text-primary);

          &:focus {
            outline: none;
            border-color: var(--color-primary);
          }
        }
      }

      select {
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        font-size: 0.875rem;
        background: var(--bg-input);
        color: var(--text-primary);
      }

      .selected-count {
        padding: 0.625rem 1rem;
        background: var(--color-primary);
        color: white;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
      }
    }

    .broker-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }

    .broker-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        border-color: var(--color-primary);
      }

      &.selected {
        border-color: var(--color-primary);
        background: rgba(99, 102, 241, 0.05);
      }

      .broker-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.75rem;

        input[type="checkbox"] {
          width: 1.125rem;
          height: 1.125rem;
          cursor: pointer;
        }

        h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
        }
      }

      .broker-requirements {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
        margin-bottom: 0.75rem;
      }

      .requirement-tag {
        padding: 0.125rem 0.5rem;
        border-radius: 4px;
        font-size: 0.6875rem;
        font-weight: 500;
        text-transform: uppercase;

        &.req-online { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
        &.req-captcha { background: rgba(249, 115, 22, 0.1); color: #f97316; }
        &.req-email-verification { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        &.req-email-only { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
        &.req-phone-verification { background: rgba(236, 72, 153, 0.1); color: #ec4899; }
        &.req-account-required { background: rgba(107, 114, 128, 0.1); color: #6b7280; }
        &.req-id-verification { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
      }

      .broker-notes {
        margin: 0 0 0.75rem 0;
        font-size: 0.75rem;
        color: var(--text-secondary);
        line-height: 1.4;
      }

      .broker-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .broker-link {
        font-size: 0.75rem;
        color: var(--color-primary);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    .empty-state {
      grid-column: 1 / -1;
      text-align: center;
      padding: 3rem;
      color: var(--text-secondary);

      p {
        margin-bottom: 1rem;
      }
    }

    .page-footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color);
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
    }

    .btn-secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);

      &:hover {
        background: var(--bg-hover);
      }
    }
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

  getBrokerStatus(name: string): string | null {
    const status = this.runService.getBrokerStatus(name);
    return status?.status ?? null;
  }

  formatRequirement(req: string): string {
    return req.replace(/-/g, ' ');
  }

  openUrl(url: string): void {
    // In Electron, this will use shell.openExternal
    window.open(url, '_blank');
  }
}
