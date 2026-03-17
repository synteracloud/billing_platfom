import {
  AppShell,
  PageHeader,
  Card,
  Grid,
  Stack,
  Panel,
  Drawer,
  Modal,
  StatCard,
  DataTable,
  Button,
  Input,
} from '../../ui/src';
import type { ComponentType as ReactComponentType } from 'react';

export type RenderComponent = ReactComponentType<any>;

export const componentRegistry: Record<string, RenderComponent> = {
  appShell: AppShell as RenderComponent,
  pageHeader: PageHeader as RenderComponent,
  grid: Grid as RenderComponent,
  stack: Stack as RenderComponent,
  panel: Panel as RenderComponent,
  card: Card as RenderComponent,
  statCard: StatCard as RenderComponent,
  table: DataTable as RenderComponent,
  drawer: Drawer as RenderComponent,
  modal: Modal as RenderComponent,
  button: Button as RenderComponent,
  input: Input as RenderComponent,
  form: Stack as RenderComponent,
  entity: Panel as RenderComponent,
  layout: AppShell as RenderComponent,
  page: Panel as RenderComponent,
  section: Card as RenderComponent,
};

export interface ComponentRegistry {
  get: (type: string) => RenderComponent | undefined;
  set: (type: string, component: RenderComponent) => void;
  entries: () => Array<[string, RenderComponent]>;
}

export const createComponentRegistry = (
  overrides: Record<string, RenderComponent> = {},
): ComponentRegistry => {
  const registry = new Map<string, RenderComponent>([
    ...Object.entries(componentRegistry),
    ...Object.entries(overrides),
  ]);

  return {
    get: (type: string) => registry.get(type),
    set: (type: string, component: RenderComponent) => {
      registry.set(type, component);
    },
    entries: () => Array.from(registry.entries()),
  };
};
