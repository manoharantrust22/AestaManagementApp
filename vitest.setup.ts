import '@testing-library/jest-dom/vitest';

// Mock window.matchMedia for MUI components
// Using globals from vitest (globals: true in config)
// (Skipped in files that opt into `@vitest-environment node`.)
beforeAll(() => {
  if (typeof window === 'undefined') return;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

// Reset all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
