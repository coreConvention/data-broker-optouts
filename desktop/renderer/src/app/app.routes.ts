import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile-editor.component').then(m => m.ProfileEditorComponent),
  },
  {
    path: 'brokers',
    loadComponent: () =>
      import('./features/brokers/broker-list.component').then(m => m.BrokerListComponent),
  },
  {
    path: 'logs',
    loadComponent: () =>
      import('./features/logs/log-viewer.component').then(m => m.LogViewerComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(m => m.SettingsComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
