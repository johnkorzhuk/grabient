import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";

export function ThemeToggle() {
    const theme = useTheme();

    const handleToggle = () => {
        const newTheme = theme.resolved === "light" ? "dark" : "light";
        theme.set(newTheme);
    };

    return (
        <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
                <div className="transform-gpu origin-center">
                    <button
                        onClick={handleToggle}
                        style={{ backgroundColor: "var(--background)" }}
                        className={cn(
                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                            "h-8.5 w-8.5 p-0 border border-solid",
                            "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                            "text-muted-foreground hover:text-foreground",
                            "transition-colors duration-200 cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        )}
                        aria-label={`Switch to ${theme.resolved === "light" ? "dark" : "light"} mode`}
                        suppressHydrationWarning
                    >
                        <div className="transform-gpu origin-center relative">
                            <Sun
                                className="absolute rotate-90 scale-0 transition-all duration-300 ease-in-out dark:rotate-0 dark:scale-100"
                                size={18}
                            />
                            <Moon
                                className="rotate-0 scale-100 transition-all duration-300 ease-in-out dark:-rotate-90 dark:scale-0"
                                size={18}
                            />
                        </div>
                        <span className="sr-only">Toggle theme</span>
                    </button>
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" sideOffset={6}>
                <p className="flex items-center gap-2">
                    Toggle theme <Kbd>⌘ K</Kbd>
                </p>
            </TooltipContent>
        </Tooltip>
    );
}
