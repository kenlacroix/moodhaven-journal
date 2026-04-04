import { httpFetch } from './http';

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

describe('httpFetch', () => {
  const url = 'https://example.com/api';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses window.fetch when running in browser (no __TAURI_INTERNALS__)', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(mockResponse);

    // Ensure no Tauri internals
    const original = (window as Record<string, unknown>).__TAURI_INTERNALS__;
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;

    const result = await httpFetch(url, { method: 'GET' });
    expect(fetchSpy).toHaveBeenCalledWith(url, { method: 'GET' });
    expect(result.status).toBe(200);

    (window as Record<string, unknown>).__TAURI_INTERNALS__ = original;
    fetchSpy.mockRestore();
  });

  it('uses Tauri plugin-http when __TAURI_INTERNALS__ is present', async () => {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const mockTauriFetch = vi.mocked(tauriFetch);
    const mockResponse = new Response('tauri-ok', { status: 200 });
    mockTauriFetch.mockResolvedValue(mockResponse as never);

    // Simulate Tauri environment
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    const result = await httpFetch(url);
    expect(mockTauriFetch).toHaveBeenCalledWith(url, undefined);
    expect(result.status).toBe(200);

    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
  });
});
