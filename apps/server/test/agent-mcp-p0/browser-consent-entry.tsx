import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { BrowserRouter } from 'react-router-dom';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import AgentConsentPage from '../../../client/src/features/agent-oauth/consent-page';
void i18next
  .use(initReactI18next)
  .init({ lng: 'zh', resources: {}, interpolation: { escapeValue: false } })
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <BrowserRouter>
        <MantineProvider>
          <AgentConsentPage />
        </MantineProvider>
      </BrowserRouter>,
    );
  });
