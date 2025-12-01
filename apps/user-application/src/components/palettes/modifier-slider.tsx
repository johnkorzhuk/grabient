import { cn } from "@/lib/utils";
import { ModifierRangeInput } from "@/components/ui/modifier-range-input";
import { COEFF_PRECISION } from "@repo/data-ops/valibot-schema/grabient";
import { ArrowLeft, CircleSlash2 } from "lucide-react";
import { useState } from "react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface ModifierSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    colorBar?: string;
    onValueChange: (value: number) => void;
    onDragEnd?: () => void;
    onClick?: () => void;
    isActive?: boolean;
    showBackIcon?: boolean;
    className?: string;
    onTare?: () => void;
    defaultValue?: number;
    isTouchDevice?: boolean;
}

export function ModifierSlider({
    label,
    value,
    min,
    max,
    step = 0.001,
    colorBar,
    onValueChange,
    onDragEnd,
    onClick,
    isActive = false,
    showBackIcon = false,
    className,
    onTare,
    defaultValue,
    isTouchDevice = false,
}: ModifierSliderProps) {
    const [isHovered, setIsHovered] = useState(false);
    const shouldShowTare =
        onTare !== undefined &&
        defaultValue !== undefined &&
        value !== defaultValue;

    const showTareButton = shouldShowTare && (isTouchDevice || isHovered);

    return (
        <div
            className={cn("flex flex-col group", className)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className={cn(
                    "flex justify-between items-center relative mb-4",
                    "bg-transparent",
                    "transition-colors duration-200",
                    onClick ? "cursor-pointer" : "",
                )}
                onClick={onClick}
            >
                <div className="flex items-center relative gap-2.5">
                    {showBackIcon && (
                        <ArrowLeft
                            className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors duration-200"
                            strokeWidth={4}
                        />
                    )}
                    {colorBar && (
                        <div
                            className="absolute -left-4 top-1/2 -translate-y-1/2 h-2 w-2 rounded-sm"
                            style={{ backgroundColor: colorBar }}
                        />
                    )}
                    <span
                        className={cn(
                            "text-[14px] capitalize font-bold",
                            isActive
                                ? "text-foreground"
                                : "text-muted-foreground group-hover:text-foreground transition-colors duration-200",
                        )}
                    >
                        {label}
                    </span>
                    {showTareButton && (
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTare?.();
                                    }}
                                    className={cn(
                                        "inline-flex items-center justify-center",
                                        "size-4 shrink-0",
                                        "text-muted-foreground hover:text-foreground",
                                        "transition-colors duration-200",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        "cursor-pointer",
                                    )}
                                    aria-label="Reset to default value"
                                >
                                    <CircleSlash2 className="size-3.5" strokeWidth={2} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={6}>
                                <p>Zero</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                <span
                    className={cn(
                        "text-sm font-mono",
                        isActive
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground transition-colors duration-200",
                    )}
                >
                    {value.toFixed(COEFF_PRECISION)}
                </span>
            </div>

            <ModifierRangeInput
                value={[value]}
                min={min}
                max={max}
                step={step}
                onValueChange={(values) => onValueChange?.(values[0] ?? 0)}
                className={cn(
                    isActive
                        ? ""
                        : "opacity-80 group-hover:opacity-100 transition-opacity duration-200",
                )}
                onMouseUp={onDragEnd}
                onKeyUp={onDragEnd}
                onPointerUp={onDragEnd}
                ariaLabel={`${label} slider, value ${value.toFixed(3)}`}
            />
        </div>
    );
}
