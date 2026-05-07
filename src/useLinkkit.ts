import { useContext } from 'react';
import { LinkkitContext } from './LinkkitContext';
import type { LinkkitContextValue } from './types';

export function useLinkkit(): LinkkitContextValue {
  const ctx = useContext(LinkkitContext);
  if (!ctx) {
    throw new Error('useLinkkit must be used inside <LinkkitProvider>');
  }
  return ctx;
}
