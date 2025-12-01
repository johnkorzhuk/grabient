import type { PropsWithChildren } from "react";
import { ScriptOnce } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import * as v from "valibot";
import * as React from "react";

const themeSchema = v.picklist(["dark", "light", "system"] as const);

type Theme = v.InferInput<typeof themeSchema>;
type ResolvedTheme = Exclude<Theme, "system">;

interface ThemeContext {
    value: Theme;
    resolved: ResolvedTheme;
    set: (theme: Theme) => void;
    toggle: () => void;
}

const ThemeProviderContext = React.createContext<ThemeContext | undefined>(
    undefined,
);

const ANIMATION_DISABLE_DURATION = 300;

export function ThemeProvider({ children }: PropsWithChildren) {
    const [theme, _setTheme] = useState<Theme>(getLocalTheme);
    const [resolvedTheme, _setResolvedTheme] = useState<ResolvedTheme>(
        getResolvedTheme(theme),
    );
    const timeoutRef = useRef<number | null>(null);

    const setTheme = (theme: Theme) => {
        _setTheme(theme);
        _setResolvedTheme(getResolvedTheme(theme));
    };

    const toggleTheme = () => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
    };

    const disableAnimationsTemporarily = () => {
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        const elements = document.querySelectorAll(
            ".disable-animation-on-theme-change",
        );

        elements.forEach((element) => {
            element.classList.add("no-transitions");
        });

        timeoutRef.current = window.setTimeout(() => {
            elements.forEach((element) => {
                element.classList.remove("no-transitions");
            });
            timeoutRef.current = null;
        }, ANIMATION_DISABLE_DURATION);
    };

    useEffect(() => {
        localStorage.setItem("theme", theme);
    }, [theme]);

    useEffect(() => {
        disableAnimationsTemporarily();

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
        return () =>
            window.removeEventListener("storage", handleStorageListener);
    }, []);

    useEffect(() => {
        if (theme !== "system") {
            return;
        }

        const handleSystemThemeChange = () => {
            _setResolvedTheme(getResolvedTheme(theme));
        };

        const media = window.matchMedia("(prefers-color-scheme: dark)");

        media.addListener(handleSystemThemeChange);
        return () => media.removeListener(handleSystemThemeChange);
    }, [theme]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current);
            }
        };
    }, []);

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

          if (!document.getElementById('theme-transitions-style')) {
            const style = document.createElement('style')
            style.id = 'theme-transitions-style'
            style.textContent = '.no-transitions, .no-transitions * { transition: none !important; animation: none !important; }'
            document.head.appendChild(style)
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

    try {
        return v.parse(themeSchema, localTheme);
    } catch (error) {
        return "system";
    }
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

export { themeSchema };
export type { ResolvedTheme, Theme };
