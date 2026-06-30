import '@testing-library/jest-dom';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';

// Some LangChain dependencies (via LangSmith) expect TextEncoder/TextDecoder
// to exist in the global scope. JSDOM test environments may not provide it.
const g = globalThis as unknown as {
  TextEncoder?: typeof globalThis.TextEncoder;
  TextDecoder?: typeof globalThis.TextDecoder;
  ReadableStream?: typeof globalThis.ReadableStream;
};

if (typeof g.TextEncoder === 'undefined') {
  g.TextEncoder = NodeTextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = NodeTextDecoder as unknown as typeof globalThis.TextDecoder;
}
if (typeof g.ReadableStream === 'undefined') {
  g.ReadableStream = NodeReadableStream as unknown as typeof globalThis.ReadableStream;
}

jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
    };
  },
  usePathname() {
    return '';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

jest.mock('next-themes', () => ({
  useTheme() {
    return {
      theme: 'light',
      setTheme: jest.fn(),
    };
  },
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('lucide-react', () => ({
  ArrowUp: () => <div data-testid="arrow-up-icon" />,
  FileCode: () => <div data-testid="file-code-icon" />,
  Paperclip: () => <div data-testid="paperclip-icon" />,
  Menu: () => <div data-testid="menu-icon" />,
  X: () => <div data-testid="x-icon" />,
  Sun: () => <div data-testid="sun-icon" />,
  Moon: () => <div data-testid="moon-icon" />,
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
  ArrowLeft: () => <div data-testid="arrow-left-icon" />,
  BadgeCheck: () => <div data-testid="badge-check-icon" />,
  Building2: () => <div data-testid="building2-icon" />,
  Eye: () => <div data-testid="eye-icon" />,
  ExternalLink: () => <div data-testid="external-link-icon" />,
  FileText: () => <div data-testid="file-text-icon" />,
  ListFilter: () => <div data-testid="list-filter-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  RefreshCw: () => <div data-testid="refresh-cw-icon" />,
  Rocket: () => <div data-testid="rocket-icon" />,
  Save: () => <div data-testid="save-icon" />,
  Check: () => <div data-testid="check-icon" />,
  Circle: () => <div data-testid="circle-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  ChevronUp: () => <div data-testid="chevron-up-icon" />,
  Loader2: () => <div data-testid="loader2-icon" />,
  Sparkles: () => <div data-testid="sparkles-icon" />,
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
