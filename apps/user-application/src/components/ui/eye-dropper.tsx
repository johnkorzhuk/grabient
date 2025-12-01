import { Pipette, Check } from "lucide-react";
import { useEyeDropper, useClipboard } from "@mantine/hooks";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { useState, useEffect, useRef } from "react";
import { detectDevice } from "@/lib/deviceDetection";

interface EyeDropperProps {
    onColorSelect?: (color: string) => void;
}

export function EyeDropper({ onColorSelect }: EyeDropperProps) {
    const { supported, open } = useEyeDropper();
    const clipboard = useClipboard({ timeout: 1000 });
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const device = detectDevice();

    const handleClick = async () => {
        try {
            const result = await open();
            if (result) {
                clipboard.copy(result.sRGBHex);
                setCopied(true);
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => {
                    setCopied(false);
                }, 1000);

                if (onColorSelect) {
                    onColorSelect(result.sRGBHex);
                }
            }
        } catch (error) {
            // User cancelled or error occurred
        }
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    if (!supported || device.isIOS) {
        return null;
    }

    return (
        <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
                <div className="transform-gpu origin-center hidden sm:block">
                    <button
                        onClick={handleClick}
                        style={{ backgroundColor: "var(--background)" }}
                        className={cn(
                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                            "h-8.5 w-8.5 p-0 border border-solid",
                            "text-muted-foreground hover:text-foreground",
                            "transition-colors duration-200 cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            copied
                                ? "border-muted-foreground/30 bg-background/60 text-foreground"
                                : "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                        )}
                        aria-label="Pick color from screen"
                        suppressHydrationWarning
                    >
                        {copied ? <Check size={18} /> : <Pipette size={18} />}
                        <span className="sr-only">Pick color from screen</span>
                    </button>
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" sideOffset={6}>
                <p className="flex items-center gap-2">
                    {copied ? "Copied!" : "Pick color"} <Kbd>⌘ E</Kbd>
                </p>
            </TooltipContent>
        </Tooltip>
    );
}
