import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Dna } from "lucide-react";
import { useStore } from "@tanstack/react-store";
import { exportStore, getUniqueSeedsFromExportList } from "@/stores/export";

interface MixButtonProps {
    className?: string;
}

export function MixButton({ className }: MixButtonProps) {
    const exportList = useStore(exportStore, (state) => state.exportList);
    const uniqueSeeds = getUniqueSeedsFromExportList(exportList);
    const count = uniqueSeeds.length;

    return (
        <Link
            to="/mix"
            style={{ backgroundColor: "var(--background)" }}
            className={cn(
                "disable-animation-on-theme-change",
                "inline-flex items-center justify-center gap-2.5 rounded-md",
                "h-8 px-2.5 border border-solid",
                "transition-colors duration-200 cursor-pointer",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                "border-input text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground hover:bg-background/60",
                className,
            )}
        >
            <span className="text-xs font-medium">
                Mix {count} {count === 1 ? "palette" : "palettes"}
            </span>
            <Dna className="w-3.5 h-3.5" strokeWidth={2.5} />
        </Link>
    );
}
