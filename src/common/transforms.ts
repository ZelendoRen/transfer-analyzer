import { TransformFnParams } from 'class-transformer';

// Millisecond timestamp -> ISO string. Invalid input is passed through so
// @IsDateString() answers 400 instead of the transform throwing a 500.
export const toIsoDate = ({ value }: TransformFnParams): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const date = new Date(Number(value));
  return isNaN(date.getTime()) ? value : date.toISOString();
};

export const toInt =
  (fallback?: string) =>
  ({ value }: TransformFnParams): number | undefined => {
    const raw = (value === undefined || value === '' ? fallback : value) as
      | string
      | undefined;
    return raw === undefined ? undefined : parseInt(raw, 10);
  };

export const toUpperCase = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.toUpperCase() : value;
