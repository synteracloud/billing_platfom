import type { ComponentSchema } from './component-schema';
import type { LayoutSchema } from './layout-schema';

export type RendererSchemaType = 'screen' | 'workspace' | 'flow';

export interface DataBindingDefinition {
  path: string;
  source: 'api' | 'state' | 'computed' | 'context';
  required?: boolean;
  defaultValue?: unknown;
}

export interface RendererSchema {
  id: string;
  type: RendererSchemaType;
  layout: LayoutSchema;
  components: ComponentSchema[];
  dataBindings?: Record<string, DataBindingDefinition>;
}
