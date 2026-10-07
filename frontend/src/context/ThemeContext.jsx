import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nexus-theme') || 'dark';
    }
    return 'dark';
  });

  const [resolvedTheme, setResolvedTheme] = useState(theme);

  useEffect(() => {
    const root = document.documentElement;
    
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      setResolvedTheme(systemTheme);
      root.setAttribute('data-theme', systemTheme);
      
      const handleChange = (e) => {
        const newTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(newTheme);
        root.setAttribute('data-theme', newTheme);
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      setResolvedTheme(theme);
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const setThemeMode = useCallback((newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('nexus-theme', newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme: setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}