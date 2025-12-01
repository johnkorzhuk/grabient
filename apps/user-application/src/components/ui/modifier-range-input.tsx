import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface ModifierRangeInputProps
    extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
    min?: number;
    max?: number;
    step?: number;
    defaultValue?: number[];
    value?: number[];
    onValueChange?: (value: number[]) => void;
    className?: string;
    ariaLabel?: string;
}

const ModifierRangeInput = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    ModifierRangeInputProps
>(
    (
        {
            className,
            min = 0,
            max = 100,
            step = 1,
            value,
            defaultValue,
            onValueChange,
            ariaLabel,
            ...props
        },
        ref,
    ) => {
        const currentValue = value || defaultValue || [0];
        const currentVal = currentValue[0] ?? 0;
        const middle = (min + max) / 2;
        const valueIsMiddle =
            Number(currentVal.toFixed(2)) === Number(middle.toFixed(2));
        const range = max - min;

        const middlePercent = ((middle - min) / range) * 100;
        const valuePercent = ((currentVal - min) / range) * 100;

        let barWidth = 0;
        let barStart = 0;

        if (currentVal < middle) {
            barWidth = middlePercent - valuePercent;
            barStart = valuePercent;
        } else if (currentVal > middle) {
            barWidth = valuePercent - middlePercent;
            barStart = middlePercent;
        }

        return (
            <SliderPrimitive.Root
                ref={ref}
                min={min}
                max={max}
                step={step}
                value={value}
                defaultValue={defaultValue}
                onValueChange={onValueChange}
                className={cn(
                    "relative flex w-full touch-none select-none items-center",
                    className,
                )}
                {...props}
            >
                <SliderPrimitive.Track className="relative h-[2px] w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    {!valueIsMiddle && (
                        <div
                            className="absolute h-full text-muted-foreground group-hover:text-foreground transition-colors duration-200 bg-current"
                            style={{
                                left: `${barStart}%`,
                                width: `${barWidth}%`,
                            }}
                        />
                    )}
                </SliderPrimitive.Track>

                <div
                    className={cn(
                        "absolute h-[8px] w-[2px] -translate-x-[1px] text-muted-foreground group-hover:text-foreground transition-colors duration-200 bg-current",
                        valueIsMiddle ? "hidden" : "block",
                    )}
                    style={{
                        left: `${middlePercent}%`,
                    }}
                />

                <SliderPrimitive.Thumb
                    aria-label={ariaLabel || "Modifier value"}
                    className={cn(
                        "relative block h-[8px] w-[8px] rounded-full border text-muted-foreground group-hover:text-foreground transition-colors duration-200 border-current shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
                        valueIsMiddle ? "bg-background" : "bg-current",
                    )}
                >
                    <div className="absolute -inset-3 cursor-pointer" />
                </SliderPrimitive.Thumb>
            </SliderPrimitive.Root>
        );
    },
);

ModifierRangeInput.displayName = "ModifierRangeInput";

export { ModifierRangeInput };
