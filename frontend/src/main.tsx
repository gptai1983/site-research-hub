import React from 'react';
import ReactDOM from 'react-dom/client';
import { TrpcProvider } from './lib/trpc';
import { AuthProvider } from './lib/auth';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TrpcProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </TrpcProvider>
  </React.StrictMode>
);