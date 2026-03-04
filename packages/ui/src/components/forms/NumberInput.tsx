import type { InputHTMLAttributes } from 'react';
import { Input } from './Input';

export const NumberInput = (props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => (
  <Input {...props} type="number" />
);
