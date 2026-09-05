import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui';
import { initTheme } from './lib/theme';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/pages.css';
import './styles/pages-student.css';
import './styles/pages-teacher.css';
import './styles/pages-admin.css';
import './styles/auth.css';
import './styles/landing.css';
import './styles/product-frame.css';

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 429 clears on its own, so it earns two retries with a growing
      // pause. Any other 4xx is the server's final answer — asking again
      // only adds to the load that caused it.
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.status === 429) return failureCount < 2;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 1;
      },
      retryDelay: (attempt, error) =>
        error instanceof ApiError && error.status === 429
          ? Math.min(4000 * 2 ** attempt, 15_000)
          : Math.min(1000 * 2 ** attempt, 5000),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
