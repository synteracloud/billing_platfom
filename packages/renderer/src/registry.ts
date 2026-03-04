import { createElement, type ComponentType as ReactComponentType, type ReactNode } from 'react';

export type RenderComponent = ReactComponentType<Record<string, unknown>>;

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
  ['table', createTokenizedPlaceholder('DataTable')],
  ['form', createTokenizedPlaceholder('FormRenderer')],
  ['card', createTokenizedPlaceholder('Card')],
  ['drawer', createTokenizedPlaceholder('Drawer')],
  ['grid', createTokenizedPlaceholder('Grid')],
  ['layout', createTokenizedPlaceholder('Layout')],
  ['page', createTokenizedPlaceholder('Page')],
  ['stack', createTokenizedPlaceholder('Stack')],
  ['section', createTokenizedPlaceholder('Section')],
  ['panel', createTokenizedPlaceholder('Panel')],
  ['entity', createTokenizedPlaceholder('EntityEditor')],
  ['text', createTokenizedPlaceholder('Text')],
  ['button', createTokenizedPlaceholder('Button')],
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
