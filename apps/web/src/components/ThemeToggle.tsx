import { useState } from 'react';
import { applyTheme, currentTheme } from '../lib/theme';
import { IconMoon, IconSun } from './icons';
import { IconButton } from './ui';

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => currentTheme());
  const isDark = theme === 'dark';

  return (
    <IconButton
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => {
        const next = isDark ? 'light' : 'dark';
        applyTheme(next);
        setTheme(next);
      }}
    >
      {isDark ? <IconSun size={17} /> : <IconMoon size={17} />}
    </IconButton>
  );
}
