import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "~/lib/utils";

export function ThemeToggle() {
  const theme = useTheme();

  const handleToggle = () => {
    const newTheme = theme.resolved === "light" ? "dark" : "light";
    theme.set(newTheme);
  };

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "inline-flex items-center justify-center rounded-md",
        "h-8 w-8 p-0 border",
        "border-input hover:border-muted-foreground/30 hover:bg-accent",
        "text-muted-foreground hover:text-foreground",
        "transition-colors duration-200 cursor-pointer",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      )}
      aria-label={`Switch to ${theme.resolved === "light" ? "dark" : "light"} mode`}
      suppressHydrationWarning
    >
      <div className="relative">
        <Sun
          className="absolute h-4 w-4 rotate-90 scale-0 transition-all duration-300 ease-in-out dark:rotate-0 dark:scale-100"
        />
        <Moon
          className="h-4 w-4 rotate-0 scale-100 transition-all duration-300 ease-in-out dark:-rotate-90 dark:scale-0"
        />
      </div>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
