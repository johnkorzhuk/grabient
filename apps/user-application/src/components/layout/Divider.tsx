import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/theme-provider";

export function PrimaryDivider({ className }: { className?: string }) {
    const { resolved: theme } = useTheme();
    return (
        <div
            suppressHydrationWarning
            className={cn(
                "block w-full absolute top-0 px-5 lg:px-14",
                className,
                {
                    "opacity-50": theme === "dark",
                    "opacity-80": theme === "light",
                },
            )}
        >
            <div
                className="h-[1px] w-full"
                style={{
                    backgroundImage:
                        "linear-gradient(to right, var(--muted-foreground) 0%, var(--muted-foreground) 2px, transparent 2px, transparent 12px)",
                    backgroundSize: "6px 1px",
                }}
            ></div>
        </div>
    );
}
