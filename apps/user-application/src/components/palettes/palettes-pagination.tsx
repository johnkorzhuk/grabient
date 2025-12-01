import { Link } from "@tanstack/react-router";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

interface PalettesPaginationProps {
    currentPage: number;
    totalPages: number;
    limit: number;
}

export function PalettesPagination({
    currentPage,
    totalPages,
    limit,
}: PalettesPaginationProps) {
    // Ensure currentPage and totalPages are valid numbers
    const validCurrentPage = Number.isFinite(currentPage) ? currentPage : 1;
    const validTotalPages = Number.isFinite(totalPages) ? totalPages : 0;

    // Smart pagination: always show first and last pages, always render 5 page numbers
    const getPageNumbers = (): (number | "ellipsis")[] => {
        // Handle edge cases
        if (validTotalPages <= 0) return [];
        if (validTotalPages === 1) return [1];
        if (validTotalPages <= 5) {
            // Show all pages if 5 or fewer
            return Array.from({ length: validTotalPages }, (_, i) => i + 1);
        }

        const pages: (number | "ellipsis")[] = [];

        // Clamp currentPage to valid range
        const safePage = Math.max(1, Math.min(validCurrentPage, validTotalPages));

        // Always start with page 1
        pages.push(1);

        // Calculate the 3 middle page numbers
        let middleStart: number;
        let middleEnd: number;

        if (safePage <= 3) {
            // Near the start: show pages 2, 3, 4
            middleStart = 2;
            middleEnd = 4;
        } else if (safePage >= validTotalPages - 2) {
            // Near the end: show last 3 pages before the final page
            middleStart = validTotalPages - 3;
            middleEnd = validTotalPages - 1;
        } else {
            // In the middle: show current page and its neighbors
            middleStart = safePage - 1;
            middleEnd = safePage + 1;
        }

        // Determine if we need ellipsis after page 1
        if (middleStart > 2) {
            pages.push("ellipsis");
        }

        // Add the 3 middle pages (ensure they're within valid range and don't duplicate page 1 or last page)
        for (let i = middleStart; i <= middleEnd; i++) {
            if (i > 1 && i < validTotalPages) {
                pages.push(i);
            }
        }

        // Determine if we need ellipsis before the last page
        if (middleEnd < validTotalPages - 1) {
            pages.push("ellipsis");
        }

        // Always end with the last page
        pages.push(validTotalPages);

        return pages;
    };

    const pageNumbers = getPageNumbers();

    return (
        <div className="mx-auto w-full px-5 lg:px-14 py-3 mt-16">
            {validTotalPages > 1 ? (
                <Pagination className="justify-center">
                    <PaginationContent>
                        {pageNumbers.map((page, index) => (
                                <PaginationItem
                                    key={
                                        page === "ellipsis"
                                            ? `ellipsis-${index}`
                                            : page
                                    }
                                >
                                    {page === "ellipsis" ? (
                                        <span className="flex items-center justify-center w-9 h-8.5 text-muted-foreground">
                                            ...
                                        </span>
                                    ) : (
                                        <Link
                                            to="."
                                            search={(prev) => ({
                                                ...prev,
                                                page,
                                                limit,
                                            })}
                                            resetScroll={false}
                                            className={cn(
                                                "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                                "w-9 h-8.5 px-3 font-bold text-sm border border-solid bg-background",
                                                "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                                "text-muted-foreground hover:text-foreground",
                                                "transition-colors duration-200 cursor-pointer",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                validCurrentPage === page &&
                                                    "border-muted-foreground/30 text-foreground",
                                            )}
                                            suppressHydrationWarning
                                        >
                                            {page}
                                        </Link>
                                    )}
                                </PaginationItem>
                        ))}
                    </PaginationContent>
                </Pagination>
            ) : (
                <div aria-hidden="true" />
            )}
        </div>
    );
}
