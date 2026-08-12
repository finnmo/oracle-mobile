import { createContext, useContext } from 'react';
import { BrandingSettings } from '../types';
import { DEFAULT_BRANDING } from '../branding';

interface BrandingContextValue {
  branding: BrandingSettings;
  setBranding: (next: BrandingSettings) => void;
}

export const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  setBranding: () => {},
});

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
