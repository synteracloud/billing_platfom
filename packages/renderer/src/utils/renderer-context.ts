import type { ComponentType } from '../types/component-schema';

export interface RendererContext {
  data?: Record<string, unknown>;
  resolveBinding: (path: string) => unknown;
  resolveToken: (tokenPath: string) => string;
  registerRenderTrace: (componentId: string, type: ComponentType) => void;
}

export interface RendererContextOptions {
  data?: Record<string, unknown>;
  tokenPrefix?: string;
}

export const createRendererContext = (
  options: RendererContextOptions = {},
): RendererContext => {
  const renderTrace = new Set<string>();

  const resolveBinding = (path: string): unknown => {
    const segments = path.split('.').filter(Boolean);
    let current: unknown = options.data;

    for (const segment of segments) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  };

  const resolveToken = (tokenPath: string): string => {
    const prefix = options.tokenPrefix ?? '--bp';
    return `var(${prefix}-${tokenPath.replace(/\./g, '-')})`;
  };

  const registerRenderTrace = (componentId: string, type: ComponentType): void => {
    renderTrace.add(`${componentId}:${type}`);
  };

  return {
    data: options.data,
    resolveBinding,
    resolveToken,
    registerRenderTrace,
  };
};
