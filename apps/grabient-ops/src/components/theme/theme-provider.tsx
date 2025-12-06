import type { PropsWithChildren } from "react";
import { ScriptOnce } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as React from "react";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeContext {
  value: Theme;
  resolved: ResolvedTheme;
  set: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeProviderContext = React.createContext<ThemeContext | undefined>(
  undefined
);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, _setTheme] = useState<Theme>(getLocalTheme);
  const [resolvedTheme, _setResolvedTheme] = useState<ResolvedTheme>(
    getResolvedTheme(theme)
  );

  const setTheme = (theme: Theme) => {
    _setTheme(theme);
    _setResolvedTheme(getResolvedTheme(theme));
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;

    if (resolvedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const handleStorageListener = () => {
      setTheme(getLocalTheme());
    };

    handleStorageListener();

    window.addEventListener("storage", handleStorageListener);
    return () => window.removeEventListener("storage", handleStorageListener);
  }, []);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const handleSystemThemeChange = () => {
      _setResolvedTheme(getResolvedTheme(theme));
    };

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, [theme]);

  const context: ThemeContext = {
    value: theme,
    resolved: resolvedTheme,
    set: setTheme,
    toggle: toggleTheme,
  };

  return (
    <ThemeProviderContext.Provider value={context}>
      <ScriptOnce>
        {`
          function initTheme() {
            if (typeof localStorage === 'undefined') return

            const localTheme = localStorage.getItem('theme')
            const preferTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
            const resolvedTheme = localTheme === null || localTheme === 'system' ? preferTheme : localTheme

            if (localTheme === null) {
              localStorage.setItem('theme', 'system')
            }

            document.documentElement.dataset.theme = resolvedTheme
            document.documentElement.style.colorScheme = resolvedTheme

            if (resolvedTheme === 'dark') {
              document.documentElement.classList.add('dark')
            } else {
              document.documentElement.classList.remove('dark')
            }
          }

          initTheme()
        `}
      </ScriptOnce>
      {children}
    </ThemeProviderContext.Provider>
  );
}

function getLocalTheme(): Theme {
  if (typeof localStorage === "undefined") {
    return "system";
  }

  const localTheme = localStorage.getItem("theme");
  if (localTheme === null) {
    localStorage.setItem("theme", "system");
    return "system";
  }

  if (localTheme === "dark" || localTheme === "light" || localTheme === "system") {
    return localTheme;
  }

  return "system";
}

function getPreferTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getResolvedTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getPreferTheme() : theme;
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
