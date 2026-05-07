import { createContext } from 'react';
import type { LinkkitContextValue } from './types';

export const LinkkitContext = createContext<LinkkitContextValue | null>(null);
