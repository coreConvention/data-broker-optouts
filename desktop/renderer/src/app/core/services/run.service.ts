import { Injectable, inject, signal, computed } from '@angular/core';
import { ElectronService, RunOptions, ProgressData, Broker } from './electron.service';

export interface BrokerStatus {
  name: string;
  status: 'pending' | 'processing' | 'captcha' | 'manual' | 'success' | 'failed' | 'skipped';
  message?: string;
}

export interface RunStats {
  success: number;
  failed: number;
  skipped: number;
  manual: number;
  pending: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class RunService {
  private electronService = inject(ElectronService);

  // State
  private readonly brokerStatuses = signal<Map<string, BrokerStatus>>(new Map());
  private readonly selectedBrokers = signal<Set<string>>(new Set());

  // Expose electron service signals
  readonly isRunning = this.electronService.isRunning;
  readonly isPaused = this.electronService.isPaused;
  readonly progress = this.electronService.progress;
  readonly logs = this.electronService.logs;
  readonly progressPercent = this.electronService.progressPercent;
  readonly humanInputPrompt = this.electronService.humanInputPrompt;

  // Current broker info
  readonly currentBroker = computed(() => this.progress()?.broker ?? null);
  readonly currentStatus = computed(() => this.progress()?.status ?? null);
  readonly currentMessage = computed(() => this.progress()?.message ?? null);

  // Statistics
  readonly stats = computed<RunStats>(() => {
    const statuses = this.brokerStatuses();
    let success = 0;
    let failed = 0;
    let skipped = 0;
    let manual = 0;
    let pending = 0;

    statuses.forEach(status => {
      switch (status.status) {
        case 'success': success++; break;
        case 'failed': failed++; break;
        case 'skipped': skipped++; break;
        case 'manual': manual++; break;
        case 'pending': pending++; break;
      }
    });

    return {
      success,
      failed,
      skipped,
      manual,
      pending,
      total: statuses.size
    };
  });

  constructor() {
    // Subscribe to progress updates to track broker statuses
    // Note: In a real implementation, we'd use effect() here
  }

  // Selection management
  selectBroker(name: string): void {
    this.selectedBrokers.update(set => {
      const newSet = new Set(set);
      newSet.add(name);
      return newSet;
    });
  }

  deselectBroker(name: string): void {
    this.selectedBrokers.update(set => {
      const newSet = new Set(set);
      newSet.delete(name);
      return newSet;
    });
  }

  toggleBroker(name: string): void {
    this.selectedBrokers.update(set => {
      const newSet = new Set(set);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      return newSet;
    });
  }

  selectAll(brokers: Broker[]): void {
    this.selectedBrokers.set(new Set(brokers.map(b => b.name)));
  }

  deselectAll(): void {
    this.selectedBrokers.set(new Set());
  }

  isSelected(name: string): boolean {
    return this.selectedBrokers().has(name);
  }

  getSelectedBrokers(): string[] {
    return [...this.selectedBrokers()];
  }

  getSelectedCount(): number {
    return this.selectedBrokers().size;
  }

  // Run controls
  async start(options: Partial<RunOptions> = {}): Promise<void> {
    const selected = this.getSelectedBrokers();
    const runOptions: RunOptions = {
      ...options,
      filter: selected.length > 0 ? selected : undefined
    };

    // Initialize broker statuses
    const statuses = new Map<string, BrokerStatus>();
    selected.forEach(name => {
      statuses.set(name, { name, status: 'pending' });
    });
    this.brokerStatuses.set(statuses);

    await this.electronService.startRun(runOptions);
  }

  async stop(): Promise<void> {
    await this.electronService.stopRun();
  }

  async pause(): Promise<void> {
    await this.electronService.pauseRun();
  }

  async resume(): Promise<void> {
    await this.electronService.resumeRun();
  }

  async submitHumanInput(response: string): Promise<void> {
    await this.electronService.submitHumanInput(response);
  }

  clearLogs(): void {
    this.electronService.clearLogs();
  }

  // Update broker status (called when progress updates)
  updateBrokerStatus(name: string, status: BrokerStatus['status'], message?: string): void {
    this.brokerStatuses.update(map => {
      const newMap = new Map(map);
      newMap.set(name, { name, status, message });
      return newMap;
    });
  }

  getBrokerStatus(name: string): BrokerStatus | undefined {
    return this.brokerStatuses().get(name);
  }
}
