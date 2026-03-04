export type ComponentType =
  | 'layout'
  | 'page'
  | 'grid'
  | 'stack'
  | 'section'
  | 'panel'
  | 'card'
  | 'drawer'
  | 'form'
  | 'table'
  | 'entity'
  | 'text'
  | 'button';

export type SchemaPrimitive = string | number | boolean | null;
export type SchemaValue =
  | SchemaPrimitive
  | SchemaValue[]
  | { [key: string]: SchemaValue };

export interface ResponsiveRule<T = SchemaValue> {
  mobile?: T;
  tablet?: T;
  desktop?: T;
}

export interface ComponentSchema {
  id: string;
  type: ComponentType;
  component?: string;
  props?: Record<string, SchemaValue>;
  responsive?: Record<string, ResponsiveRule>;
  children?: ComponentSchema[];
}
