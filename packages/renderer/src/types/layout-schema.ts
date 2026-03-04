import type { ComponentSchema } from './component-schema';

export type LayoutType = 'page' | 'grid' | 'stack' | 'section' | 'panel';

export interface LayoutSchema {
  id: string;
  type: LayoutType;
  title?: string;
  description?: string;
  responsive?: {
    columns?: {
      mobile?: number;
      tablet?: number;
      desktop?: number;
    };
    gap?: {
      mobile?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
      tablet?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
      desktop?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    };
  };
  regions: ComponentSchema[];
}
