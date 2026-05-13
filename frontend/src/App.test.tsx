import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrpcProvider } from './lib/trpc';
import { AuthProvider } from './lib/auth';
import { App } from './App';

function renderApp() {
  return render(
    <TrpcProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </TrpcProvider>
  );
}

describe('App', () => {
  it('renders login title when not authenticated', () => {
    renderApp();
    expect(screen.getByText('Hermes Research Hub')).toBeDefined();
  });

  it('shows sign in button', () => {
    renderApp();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDefined();
  });

  it('shows email and password inputs', () => {
    renderApp();
    expect(screen.getByPlaceholderText('Email')).toBeDefined();
    expect(screen.getByPlaceholderText('Password')).toBeDefined();
  });
});
