import type { InputHTMLAttributes } from 'react';
import { Input } from './Input';

export const CurrencyInput = (props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'>) => (
  <Input {...props} type="text" inputMode="decimal" />
);
