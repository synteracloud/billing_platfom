import type { TextareaHTMLAttributes } from 'react';
import { tokens } from '../../tokens/tokens';

export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    style={{
      width: '100%',
      border: `${tokens.border.width.thin} solid ${tokens.color.borderDefault}`,
      borderRadius: tokens.radius.md,
      padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
      minHeight: tokens.size.textareaMinHeight,
      backgroundColor: tokens.color.surface,
      color: tokens.color.textPrimary,
      ...(props.style ?? {}),
    }}
  />
);
