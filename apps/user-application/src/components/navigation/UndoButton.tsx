import { Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { useStore } from "@tanstack/react-store";
import { undoStore, popUndoAction, removeExpiredActions } from "@/stores/undo";
import { useLikePaletteMutation } from "@/mutations/palettes";
import { useEffect } from "react";
import { useHotkeys } from "@mantine/hooks";

export function UndoButton() {
    const undoHistory = useStore(undoStore, (state) => state.undoHistory);
    const likeMutation = useLikePaletteMutation();

    const handleUndo = () => {
        const action = popUndoAction();
        if (action) {
            likeMutation.mutate({
                seed: action.seed,
                steps: action.steps,
                style: action.style,
                angle: action.angle,
                palette: action.palette,
                isUndo: true,
            });
        }
    };

    useHotkeys([
        ['mod+z', handleUndo],
    ]);

    useEffect(() => {
        const interval = setInterval(() => {
            removeExpiredActions();
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    if (undoHistory.length === 0) {
        return null;
    }

    return (
        <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
                <button
                    onClick={handleUndo}
                    style={{
                        backgroundColor: "var(--background)",
                    }}
                    className={cn(
                        "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                        "h-8.5 w-8.5 p-0 border border-solid",
                        "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                        "text-muted-foreground hover:text-foreground",
                        "transition-colors duration-200 cursor-pointer",
                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                    )}
                    aria-label="Undo unsave palette"
                    suppressHydrationWarning
                    disabled={likeMutation.isPending}
                >
                    <Undo2
                        size={16}
                        style={{
                            color: "currentColor",
                        }}
                    />
                </button>
            </TooltipTrigger>
            <TooltipContent
                side="top"
                align="end"
                sideOffset={6}
            >
                <p className="flex items-center gap-2">
                    Undo <Kbd>⌘ Z</Kbd>
                </p>
            </TooltipContent>
        </Tooltip>
    );
}
