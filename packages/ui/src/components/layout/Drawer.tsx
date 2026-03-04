import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

interface DrawerProps {
  open?: boolean;
  children?: ReactNode;
}

export const Drawer = ({ open = false, children }: DrawerProps) => {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: tokens.color.overlay, zIndex: tokens.zIndex.overlay }}>
      <div style={{ marginLeft: 'auto', width: `min(100%, ${tokens.size.drawer})`, height: '100%', backgroundColor: tokens.color.surface, padding: tokens.spacing.lg }}>
        {children}
      </div>
    </div>
  );
};
