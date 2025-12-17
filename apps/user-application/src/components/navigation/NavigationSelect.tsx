import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
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
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@mantine/hooks";
import type { SearchSortOrder } from "@/routes/palettes/$query/index";

interface NavigationSelectProps {
    className?: string;
    popoverClassName?: string;
    disabled?: boolean;
}

type SortItem = {
    id: SearchSortOrder;
    label: string;
};

type NavigationItem = {
    id: string;
    label: string;
    path: string;
};

const SORT_TIME_ITEMS: Record<"newest" | "oldest", SortItem> = {
    newest: { id: "newest", label: "Newest" },
    oldest: { id: "oldest", label: "Oldest" },
};

const BASE_NAVIGATION_ITEMS: NavigationItem[] = [
    { id: "popular", label: "Popular", path: "/" },
    { id: "saved", label: "Saved", path: "/saved" },
];

const TIME_NAVIGATION_ITEMS: Record<"newest" | "oldest", NavigationItem> = {
    newest: { id: "newest", label: "Newest", path: "/newest" },
    oldest: { id: "oldest", label: "Oldest", path: "/oldest" },
};

export function NavigationSelect({
    className,
    popoverClassName,
    disabled = false,
}: NavigationSelectProps) {
    const location = useLocation();
    const router = useRouter();
    const search = useSearch({ strict: false }) as { sort?: SearchSortOrder };
    const [open, setOpen] = useState(false);
    const focusTrapRef = useFocusTrap(open && !disabled);

    const isSearchRoute = location.pathname.startsWith("/palettes/");
    const currentSort = search.sort || "popular";

    const currentPath = location.pathname === "/" ? "popular" : location.pathname.substring(1);
    const isTimeRoute = currentPath === "newest" || currentPath === "oldest";
    const isTimeSort = currentSort === "newest" || currentSort === "oldest";

    const oppositeTimeRoute =
        currentPath === "newest"
            ? TIME_NAVIGATION_ITEMS.oldest
            : TIME_NAVIGATION_ITEMS.newest;

    const oppositeSortTime =
        currentSort === "newest"
            ? SORT_TIME_ITEMS.oldest
            : SORT_TIME_ITEMS.newest;

    const navigationItems = [
        isTimeRoute ? oppositeTimeRoute : TIME_NAVIGATION_ITEMS.newest,
        ...BASE_NAVIGATION_ITEMS,
    ];

    const sortItems: SortItem[] = [
        isTimeSort ? oppositeSortTime : SORT_TIME_ITEMS.newest,
        { id: "popular", label: "Popular" },
    ];

    const currentItem = isSearchRoute
        ? (isTimeSort ? SORT_TIME_ITEMS[currentSort as "newest" | "oldest"] : sortItems.find((item) => item.id === currentSort) ?? sortItems[0]!)
        : isTimeRoute
            ? TIME_NAVIGATION_ITEMS[currentPath as "newest" | "oldest"]
            : navigationItems.find((item) => item.id === currentPath) ?? navigationItems[0]!;

    const handleNavigate = async (itemId: string, path: string) => {
        setOpen(false);
        if (isSearchRoute) {
            await router.navigate({
                to: location.pathname,
                search: (prev) => ({ ...prev, sort: itemId as SearchSortOrder }),
                replace: true,
            });
        } else {
            await router.preloadRoute({ to: path });
            await router.navigate({
                to: path,
                search: (prev) => ({ ...prev, page: 1 }),
            });
        }
    };

    return (
        <Popover open={open && !disabled} onOpenChange={(newOpen) => !disabled && setOpen(newOpen)} modal={false}>
            <PopoverTrigger asChild>
                <button
                    role="combobox"
                    aria-expanded={open && !disabled}
                    aria-haspopup="listbox"
                    aria-label="Navigation"
                    aria-disabled={disabled}
                    style={{ backgroundColor: "var(--background)" }}
                    className={cn(
                        "disable-animation-on-theme-change",
                        "inline-flex items-center justify-center rounded-md",
                        "w-auto min-w-[110px] md:min-w-[130px] justify-between",
                        "text-xs md:text-sm h-8.5 px-2 md:px-3 border border-solid",
                        "transition-colors duration-200",
                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        disabled
                            ? "cursor-not-allowed opacity-50 border-input text-muted-foreground"
                            : open
                                ? "border-muted-foreground/30 bg-background/60 text-foreground cursor-pointer"
                                : "border-input text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground cursor-pointer",
                        className,
                    )}
                    suppressHydrationWarning
                >
                    <span className="font-system font-semibold -translate-y-px">
                        {disabled && isSearchRoute ? "Popular" : currentItem.label}
                    </span>
                    <ChevronsUpDown
                        className="ml-1.5 md:ml-2 h-3.5 w-3.5 md:h-4 md:w-4 shrink-0"
                        style={{ color: "currentColor" }}
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
            >
                <Command
                    className="border-0 rounded-md w-full bg-transparent [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:font-system [&_[cmdk-item]]:font-medium [&_[cmdk-item]]:text-sm"
                    loop
                >
                    <CommandGroup>
                        <CommandList>
                            {isSearchRoute
                                ? sortItems.map((item) => (
                                      <CommandItem
                                          key={item.id}
                                          value={item.id}
                                          onSelect={() =>
                                              handleNavigate(item.id, "")
                                          }
                                          aria-label={`Sort by ${item.label}`}
                                          className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 [&:hover]:bg-[var(--background)] data-[selected=true]:bg-[var(--background)] data-[selected=true]:text-foreground aria-[selected=true]:bg-[var(--background)] aria-[selected=true]:text-foreground"
                                      >
                                          {item.label}
                                      </CommandItem>
                                  ))
                                : navigationItems.map((item) => (
                                      <CommandItem
                                          key={item.id}
                                          value={item.id}
                                          onSelect={() =>
                                              handleNavigate(item.id, item.path)
                                          }
                                          aria-label={`Navigate to ${item.label}`}
                                          className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 [&:hover]:bg-[var(--background)] data-[selected=true]:bg-[var(--background)] data-[selected=true]:text-foreground aria-[selected=true]:bg-[var(--background)] aria-[selected=true]:text-foreground"
                                      >
                                          {item.label}
                                      </CommandItem>
                                  ))}
                        </CommandList>
                    </CommandGroup>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
