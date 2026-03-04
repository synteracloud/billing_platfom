import type { ReactNode } from 'react';
import { tokens } from '../../tokens/tokens';

interface ModalProps {
  open?: boolean;
  children?: ReactNode;
}

export const Modal = ({ open = false, children }: ModalProps) => {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', backgroundColor: tokens.color.overlay, zIndex: tokens.zIndex.modal, padding: tokens.spacing.lg }}>
      <div style={{ width: `min(100%, ${tokens.size.modal})`, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, border: `${tokens.border.width.thin} solid ${tokens.color.borderSubtle}`, padding: tokens.spacing.xl }}>
        {children}
      </div>
    </div>
  );
};
