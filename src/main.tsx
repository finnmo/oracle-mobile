import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { BrandingContext } from './context/BrandingContext';
import { applyBranding, DEFAULT_BRANDING } from './branding';
import { fetchBranding } from './api';
import { BrandingSettings } from './types';

async function bootstrap() {
  let branding: BrandingSettings = DEFAULT_BRANDING;
  try {
    branding = await fetchBranding();
  } catch {
    // Use CSS defaults until API is available
  }
  applyBranding(branding);

  function Root() {
    const [current, setBranding] = useState(branding);
    return (
      <BrandingContext.Provider
        value={{
          branding: current,
          setBranding: (next) => {
            applyBranding(next);
            setBranding(next);
          },
        }}
      >
        <App />
      </BrandingContext.Provider>
    );
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>
  );
}

bootstrap();
