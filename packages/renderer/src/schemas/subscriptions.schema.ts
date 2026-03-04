import type { RendererSchema } from '../types/renderer-schema';

export const subscriptionsSchema: RendererSchema = {
  id: 'subscriptions',
  type: 'screen',
  layout: {
    id: 'subscriptions-layout',
    type: 'page',
    regions: [
      { id: 'subscriptions-header', type: 'section', component: 'pageHeader', props: { title: 'Subscriptions' } },
      { id: 'subscriptions-actions', type: 'section', component: 'stack', props: { region: 'primary_action_region' } },
      { id: 'subscriptions-list-region', type: 'section', component: 'card', props: { region: 'subscriptions_table_region' } },
      { id: 'subscriptions-editor-drawer', type: 'drawer', component: 'drawer', props: { region: 'subscription_editor_region' } },
    ],
  },
  components: [
    { id: 'subscriptions-list', type: 'table', component: 'table', props: { binding: 'subscriptions.list' } },
    { id: 'subscription-form', type: 'form', component: 'form', props: { binding: 'subscriptions.editor' } },
  ],
  dataBindings: {
    subscriptionsList: { path: 'subscriptions.list', source: 'api', required: true },
    subscriptionEditor: { path: 'subscriptions.editor', source: 'state' },
  },
};
