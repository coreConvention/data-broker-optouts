import { Injectable, inject, signal, computed } from '@angular/core';
import { ElectronService, Profile, Broker, Settings } from './electron.service';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private electronService = inject(ElectronService);

  // State
  readonly profile = signal<Profile | null>(null);
  readonly brokers = signal<Broker[]>([]);
  readonly settings = signal<Settings | null>(null);
  readonly dataPath = signal<string>('');
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  // Computed
  readonly brokerCount = computed(() => this.brokers().length);

  readonly brokersByRequirement = computed(() => {
    const brokers = this.brokers();
    const groups: Record<string, Broker[]> = {
      online: [],
      captcha: [],
      'email-verification': [],
      'email-only': [],
      'phone-verification': [],
      'account-required': [],
      'id-verification': [],
      other: []
    };

    brokers.forEach(broker => {
      const requirements = broker.requirements || [];
      if (requirements.length === 0) {
        groups['other'].push(broker);
      } else {
        // Categorize by primary requirement
        const primary = requirements[0];
        if (primary && groups[primary]) {
          groups[primary].push(broker);
        } else {
          groups['other'].push(broker);
        }
      }
    });

    return groups;
  });

  readonly profileComplete = computed(() => {
    const p = this.profile();
    if (!p) return false;
    return !!(p.fullName && p.email);
  });

  // Load all configuration
  async loadAll(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const [profile, brokers, settings, dataPath] = await Promise.all([
        this.electronService.loadProfile(),
        this.electronService.loadManifest(),
        this.electronService.getSettings(),
        this.electronService.getDataPath()
      ]);

      this.profile.set(profile);
      this.brokers.set(brokers);
      this.settings.set(settings);
      this.dataPath.set(dataPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load configuration';
      this.error.set(message);
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  // Profile management
  async saveProfile(profile: Profile): Promise<void> {
    await this.electronService.saveProfile(profile);
    this.profile.set(profile);
  }

  updateProfile(updates: Partial<Profile>): void {
    const current = this.profile();
    if (current) {
      this.profile.set({ ...current, ...updates });
    }
  }

  // Settings management
  async saveSettings(settings: Settings): Promise<void> {
    await this.electronService.saveSettings(settings);
    this.settings.set(settings);
  }

  updateSettings(updates: Partial<Settings>): void {
    const current = this.settings();
    if (current) {
      this.settings.set({ ...current, ...updates });
    }
  }

  // Broker filtering
  filterBrokers(query: string): Broker[] {
    const brokers = this.brokers();
    if (!query.trim()) return brokers;

    const lowerQuery = query.toLowerCase();
    return brokers.filter(b =>
      b.name.toLowerCase().includes(lowerQuery) ||
      b.requirements.some(r => r.toLowerCase().includes(lowerQuery))
    );
  }

  getBrokerByName(name: string): Broker | undefined {
    return this.brokers().find(b => b.name === name);
  }

  // Manifest updates
  async checkForUpdates(): Promise<void> {
    await this.electronService.checkManifestUpdates();
  }

  async applyUpdate(): Promise<void> {
    await this.electronService.applyManifestUpdate();
    // Reload manifest after update
    const brokers = await this.electronService.loadManifest();
    this.brokers.set(brokers);
  }
}
