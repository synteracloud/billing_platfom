import {
  AppShell,
  Button,
  Card,
  DataTable,
  Drawer,
  Grid,
  Modal,
  PageHeader,
  Panel,
  Stack,
  StatCard,
  Text,
} from '../../ui/src';
import { createElement, type ComponentType as ReactComponentType, type ReactNode } from 'react';

export type RenderComponent = ReactComponentType<Record<string, unknown>>;

const FormRenderer: RenderComponent = ({ children, ...props }) =>
  createElement('form', { ...props, children });

const Page: RenderComponent = ({ children, ...props }) =>
  createElement('div', { ...props, children });

const Section: RenderComponent = ({ children, ...props }) =>
  createElement('section', { ...props, children });

const EntityEditor: RenderComponent = ({ children, ...props }) =>
  createElement('div', { ...props, children });

export interface ComponentRegistry {
  get: (type: string) => RenderComponent | undefined;
  set: (type: string, component: RenderComponent) => void;
  entries: () => Array<[string, RenderComponent]>;
}

const createTokenizedPlaceholder = (displayName: string): RenderComponent => {
  const Placeholder = ({ children, ...props }: { children?: ReactNode }) =>
    createElement(
      'div',
      {
        ...props,
        'data-component': displayName,
      },
      children,
    );

  Placeholder.displayName = displayName;

  return Placeholder as RenderComponent;
};

const defaultRegistryMap = new Map<string, RenderComponent>([
  ['appShell', AppShell as RenderComponent],
  ['pageHeader', PageHeader as RenderComponent],
  ['table', DataTable as RenderComponent],
  ['card', Card as RenderComponent],
  ['drawer', Drawer as RenderComponent],
  ['modal', Modal as RenderComponent],
  ['statCard', StatCard as RenderComponent],
  ['form', FormRenderer],
  ['grid', Grid as RenderComponent],
  ['stack', Stack as RenderComponent],
  ['panel', Panel as RenderComponent],
  ['layout', createTokenizedPlaceholder('Layout')],
  ['page', Page],
  ['section', Section],
  ['entity', EntityEditor],
  ['text', Text as RenderComponent],
  ['button', Button as RenderComponent],
]);

export const createComponentRegistry = (
  overrides: Record<string, RenderComponent> = {},
): ComponentRegistry => {
  const registry = new Map(defaultRegistryMap);

  Object.entries(overrides).forEach(([type, component]) => {
    registry.set(type, component);
  });

  return {
    get: (type: string) => registry.get(type),
    set: (type: string, component: RenderComponent) => {
      registry.set(type, component);
    },
    entries: () => Array.from(registry.entries()),
  };
};
