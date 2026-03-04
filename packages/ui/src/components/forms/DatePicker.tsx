import type { InputHTMLAttributes } from 'react';
import { Input } from './Input';

export const DatePicker = (props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => (
  <Input {...props} type="date" />
);
