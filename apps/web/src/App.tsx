import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/shared/ThemeProvider';
import { AppRouter } from './router';

export function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
