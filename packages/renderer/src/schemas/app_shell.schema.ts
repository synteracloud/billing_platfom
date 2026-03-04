import type { RendererSchema } from '../types/renderer-schema';

export const appShellSchema: RendererSchema = {
  id: 'app-shell',
  type: 'workspace',
  layout: {
    id: 'app-shell-layout',
    type: 'page',
    regions: [
      { id: 'top-navigation-region', type: 'section', component: 'appShell', props: { region: 'top_navigation_region' } },
      { id: 'sidebar-navigation-region', type: 'section', component: 'panel', props: { region: 'sidebar_navigation_region' } },
      { id: 'content-region', type: 'section', component: 'stack', props: { region: 'content_region' } },
    ],
  },
  components: [],
  dataBindings: {
    topNavigation: { path: 'shell.topNavigation', source: 'state' },
    sidebarModules: { path: 'shell.sidebarModules', source: 'state' },
    userMenu: { path: 'shell.userMenu', source: 'state' },
  },
};
