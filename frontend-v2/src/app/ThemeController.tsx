import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { applyTheme, cachedTheme } from './theme';

/**
 * Keeps the document theme in sync with the signed-in user's saved choice.
 * Priority: user profile → cached choice from the last session → dark.
 */
export function ThemeController() {
  const { user } = useAuth();

  useEffect(() => {
    applyTheme(user?.theme || cachedTheme());
  }, [user?.theme]);

  return null;
}
