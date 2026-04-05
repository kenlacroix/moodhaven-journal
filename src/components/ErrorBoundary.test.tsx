import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = () => {
  throw new Error('test error');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error from React's error boundary logging in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <span>content</span>
      </ErrorBoundary>
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('renders default fallback UI on error', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
  });
});
