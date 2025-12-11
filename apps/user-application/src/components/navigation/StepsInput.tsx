import { useLocation, useRouter } from "@tanstack/react-router";
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    DEFAULT_STEPS,
    MAX_STEPS,
    MIN_STEPS,
} from "@repo/data-ops/valibot-schema/grabient";
import { useFocusTrap } from "@mantine/hooks";

const presets = [3, 5, 8, 13, 21, 34];
const BASE_STEP = 1;
const SHIFT_MULTIPLIER = 3;

interface StepsInputProps {
    value: number | "auto";
    className?: string;
    popoverClassName?: string;
    onPreviewChange?: (steps: number | null) => void;
    disabled?: boolean;
}

export function StepsInput({
    value,
    className,
    popoverClassName,
    onPreviewChange,
    disabled = false,
}: StepsInputProps) {
    const location = useLocation();
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState<string>("");
    const [isDirty, setIsDirty] = useState(false);
    const [previousValue, setPreviousValue] = useState<number | "auto">(value);
    const inputRef = useRef<HTMLInputElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const focusTrapRef = useFocusTrap(open && !disabled);

    useEffect(() => {
        setPreviousValue(value);
    }, [value]);

    const validateNumber = (num: number): boolean => {
        return num >= MIN_STEPS && num <= MAX_STEPS;
    };

    const handleChevronClick = (e: React.MouseEvent) => {
        if (isEditing || disabled) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
    };

    const handleLabelClick = (e: React.MouseEvent) => {
        if (disabled) return;
        if (open) {
            setOpen(false);
        }
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(true);
        setIsDirty(false);
        setLocalValue(
            value === "auto" ? DEFAULT_STEPS.toString() : value.toString(),
        );
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 0);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        setIsDirty(true);

        if (newValue === "" || newValue === "auto" || newValue === "steps") {
            onPreviewChange?.(null);
        } else {
            const numValue = Number.parseFloat(newValue);
            if (!isNaN(numValue) && validateNumber(numValue)) {
                onPreviewChange?.(Math.round(numValue));
            }
        }
    };

    const handleInputBlur = async () => {
        setIsEditing(false);

        if (!isDirty) {
            onPreviewChange?.(null);
            return;
        }

        const currentInputValue = localValue;

        if (
            currentInputValue === "" ||
            currentInputValue.trim() === "" ||
            currentInputValue === "auto"
        ) {
            await router.navigate({
                to: location.pathname,
                search: (prev) => ({
                    ...prev,
                    steps: "auto",
                }),
                replace: true,
                resetScroll: false,
            });
            onPreviewChange?.(null);
            setIsDirty(false);
            return;
        }

        const numValue = Number.parseFloat(currentInputValue);

        if (isNaN(numValue) || !validateNumber(numValue)) {
            await router.navigate({
                to: location.pathname,
                search: (prev) => ({
                    ...prev,
                    steps: previousValue || "auto",
                }),
                replace: true,
                resetScroll: false,
            });
        } else {
            const roundedSteps = Math.round(numValue);
            await router.navigate({
                to: location.pathname,
                search: (prev) => ({
                    ...prev,
                    steps: roundedSteps,
                }),
                replace: true,
                resetScroll: false,
            });
        }

        onPreviewChange?.(null);
        setIsDirty(false);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();

            const step = e.shiftKey ? BASE_STEP * SHIFT_MULTIPLIER : BASE_STEP;

            const currentNumValue =
                localValue !== ""
                    ? Number.parseFloat(localValue)
                    : value === "auto"
                      ? DEFAULT_STEPS
                      : Number(value);

            let currentValue = isNaN(currentNumValue)
                ? DEFAULT_STEPS
                : currentNumValue;

            let newValue =
                e.key === "ArrowUp" ? currentValue + step : currentValue - step;

            // Loop from max to min or min to max
            const range = MAX_STEPS - MIN_STEPS + 1;
            if (newValue > MAX_STEPS) {
                newValue = MIN_STEPS + ((newValue - MIN_STEPS) % range);
            } else if (newValue < MIN_STEPS) {
                newValue = MAX_STEPS - ((MIN_STEPS - newValue - 1) % range);
            }

            if (validateNumber(newValue)) {
                const roundedSteps = Math.round(newValue);
                setLocalValue(roundedSteps.toString());
                onPreviewChange?.(roundedSteps);
                setIsDirty(true);
            }
        }

        if (e.key === "Enter") {
            e.preventDefault();

            // If user focused on "auto" value but hasn't typed anything, commit the default
            if (!isDirty && value === "auto") {
                router.navigate({
                    to: location.pathname,
                    search: (prev) => ({
                        ...prev,
                        steps: DEFAULT_STEPS,
                    }),
                    replace: true,
                    resetScroll: false,
                });
                onPreviewChange?.(null);
            }

            inputRef.current?.blur();
        }

        if (e.key === "Escape") {
            e.preventDefault();
            router.navigate({
                to: location.pathname,
                search: (prev) => ({
                    ...prev,
                    steps: "auto",
                }),
                replace: true,
                resetScroll: false,
            });
            onPreviewChange?.(null);
            setIsDirty(false);
            inputRef.current?.blur();
        }
    };

    const handleValueClick = async (clickedValue: number) => {
        const newSteps = clickedValue === value ? "auto" : clickedValue;
        // Track this as an explicit user choice

        // Clear preview state immediately
        onPreviewChange?.(null);

        // Close the popover after selection
        setOpen(false);

        // Navigate with updated steps search param
        await router.navigate({
            to: location.pathname,
            search: (prev) => ({
                ...prev,
                steps: newSteps,
            }),
            replace: true,
            resetScroll: false,
        });
    };

    const displayValue = () => {
        if (isEditing) {
            return localValue;
        }

        if (disabled || value === undefined || value === null || value === "auto") {
            return "steps";
        }

        return value.toString();
    };

    return (
        <Popover
            open={open && !disabled}
            onOpenChange={(newOpen) => {
                if (isEditing || disabled) return;
                setOpen(newOpen);
                // Clear preview when menu closes
                if (!newOpen) {
                    onPreviewChange?.(null);
                }
            }}
            modal={false}
        >
            <PopoverTrigger asChild>
                <button
                    ref={buttonRef}
                    role="combobox"
                    aria-expanded={open && !disabled}
                    aria-haspopup="listbox"
                    aria-label="Steps input"
                    aria-disabled={disabled}
                    style={{ backgroundColor: "var(--background)" }}
                    className={cn(
                        "disable-animation-on-theme-change",
                        "inline-flex items-center justify-center rounded-md relative",
                        "w-[64px] md:w-[76px] justify-between",
                        "text-xs md:text-sm h-8 lg:h-8.5 px-2 md:px-3 border border-solid",
                        "transition-colors duration-200",
                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        disabled
                            ? "cursor-not-allowed opacity-50 border-input text-muted-foreground"
                            : open || isEditing
                                ? "border-muted-foreground/30 bg-background/60 text-foreground cursor-pointer"
                                : "border-input text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground cursor-pointer",
                        className,
                    )}
                    suppressHydrationWarning
                >
                    {isEditing && (
                        <input
                            ref={inputRef}
                            type="text"
                            value={localValue}
                            onChange={handleInputChange}
                            onBlur={handleInputBlur}
                            onKeyDown={handleInputKeyDown}
                            className="absolute inset-0 w-full h-full px-2 md:px-3 pr-7 md:pr-8 bg-transparent border-0 outline-none text-xs md:text-sm font-system font-semibold"
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                    <span
                        className="font-system font-semibold whitespace-nowrap cursor-text flex-1 text-left -translate-y-px"
                        onClick={handleLabelClick}
                        style={isEditing ? { opacity: 0 } : undefined}
                    >
                        {displayValue()}
                    </span>
                    <ChevronsUpDown
                        className="ml-1.5 md:ml-2 h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 cursor-pointer"
                        style={{ color: "currentColor" }}
                        onClick={handleChevronClick}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                ref={focusTrapRef}
                className={cn(
                    "disable-animation-on-theme-change",
                    "p-0 w-(--radix-popover-trigger-width) bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md",
                    popoverClassName,
                )}
                sideOffset={8}
                onMouseLeave={() => {
                    onPreviewChange?.(null);
                }}
            >
                <Command
                    className="border-0 rounded-md w-full bg-transparent [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:font-system [&_[cmdk-item]]:font-medium [&_[cmdk-item]]:text-sm"
                    loop
                >
                    <CommandGroup>
                        <CommandList>
                            {presets.map((preset) => (
                                <CommandItem
                                    key={preset}
                                    value={preset.toString()}
                                    onSelect={() => handleValueClick(preset)}
                                    onMouseEnter={() => {
                                        onPreviewChange?.(preset);
                                    }}
                                    aria-label={`Set steps to ${preset}`}
                                    className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 [&:hover]:bg-[var(--background)] data-[selected=true]:bg-[var(--background)] data-[selected=true]:text-foreground aria-[selected=true]:bg-[var(--background)] aria-[selected=true]:text-foreground"
                                >
                                    {preset.toString()}
                                    <CheckIcon
                                        className={cn(
                                            "mr-2 h-3 w-3 absolute right-0",
                                            value === preset
                                                ? "opacity-100"
                                                : "opacity-0",
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandList>
                    </CommandGroup>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
