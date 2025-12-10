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
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
    PALETTE_STYLES,
    STYLE_LABELS,
} from "@repo/data-ops/valibot-schema/grabient";
import { useFocusTrap } from "@mantine/hooks";

type PaletteStyle = (typeof PALETTE_STYLES)[number];

interface StyleSelectProps {
    value: "auto" | PaletteStyle;
    className?: string;
    popoverClassName?: string;
    onPreviewChange?: (style: PaletteStyle | null) => void;
}

export function StyleSelect({
    value,
    className,
    popoverClassName,
    onPreviewChange,
}: StyleSelectProps) {
    const location = useLocation();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const focusTrapRef = useFocusTrap(open);

    // Check if we're on a seed route to show deepFlow option
    const isSeedRoute = location.pathname.includes("/seed/");

    const handleValueClick = async (clickedStyle: PaletteStyle) => {
        // If clicking the already selected style, toggle to auto
        const newStyle = clickedStyle === value ? "auto" : clickedStyle;

        // Clear preview state immediately
        onPreviewChange?.(null);

        // Close the popover after selection
        setOpen(false);

        // Navigate with updated style search param
        await router.navigate({
            to: location.pathname,
            search: (prev) => ({
                ...prev,
                style: newStyle,
            }),
            replace: true,
            resetScroll: false,
        });
    };

    const button = (
        <button
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label="Select gradient style"
            style={{ backgroundColor: "var(--background)" }}
            className={cn(
                "disable-animation-on-theme-change",
                "inline-flex items-center justify-center rounded-md",
                "w-[148px] sm:w-[154px] md:w-[164px] lg:w-[184px] justify-between",
                "text-[13px] sm:text-sm h-8 lg:h-8.5 px-2 md:px-3 border border-solid",
                "transition-colors duration-200 cursor-pointer",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                open
                    ? "border-muted-foreground/30 bg-background/60 text-foreground"
                    : "border-input text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
                className,
            )}
            suppressHydrationWarning
        >
            <span className="font-system font-semibold whitespace-nowrap pl-1 md:pl-0 -translate-y-px">
                {value === "auto" ? "style" : STYLE_LABELS[value]}
            </span>
            <ChevronsUpDown
                className="ml-1.5 md:ml-2 h-3.5 w-3.5 md:h-4 md:w-4 shrink-0"
                style={{ color: "currentColor" }}
            />
        </button>
    );

    return (
        <Popover
            open={open}
            onOpenChange={(newOpen) => {
                setOpen(newOpen);
                // Clear preview when menu closes
                if (!newOpen) {
                    onPreviewChange?.(null);
                }
            }}
            modal={false}
        >
            <PopoverTrigger asChild>{button}</PopoverTrigger>
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
                    className="border-0 rounded-md w-full bg-transparent [&_[cmdk-item]]:pl-2 [&_[cmdk-item]]:pr-8 md:[&_[cmdk-item]]:pr-7 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:font-system [&_[cmdk-item]]:font-medium [&_[cmdk-item]]:text-[13px] sm:[&_[cmdk-item]]:text-sm"
                    loop
                >
                    <CommandGroup>
                        <CommandList>
                            {PALETTE_STYLES.filter((style) => {
                                // Hide deepFlow option when not on seed route
                                if (style === "deepFlow" && !isSeedRoute) {
                                    return false;
                                }
                                return true;
                            }).map((style) => (
                                <CommandItem
                                    key={style}
                                    value={style}
                                    onSelect={() => handleValueClick(style)}
                                    onMouseEnter={() => {
                                        onPreviewChange?.(style);
                                    }}
                                    aria-label={`Select ${STYLE_LABELS[style]} style`}
                                    className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 [&:hover]:bg-[var(--background)] data-[selected=true]:bg-[var(--background)] data-[selected=true]:text-foreground aria-[selected=true]:bg-[var(--background)] aria-[selected=true]:text-foreground whitespace-nowrap"
                                >
                                    {STYLE_LABELS[style]}
                                    <CheckIcon
                                        className={cn(
                                            "h-3 w-3 absolute right-0.5 md:right-2",
                                            value === style
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
