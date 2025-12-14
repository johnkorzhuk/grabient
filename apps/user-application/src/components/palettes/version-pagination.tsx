import {
    Pagination,
    PaginationContent,
    PaginationItem,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

interface VersionPaginationProps {
    currentVersion: number;
    totalVersions: number;
    onVersionChange: (version: number) => void;
}

export function VersionPagination({
    currentVersion,
    totalVersions,
    onVersionChange,
}: VersionPaginationProps) {
    // Ensure values are valid numbers
    const validCurrentVersion = Number.isFinite(currentVersion) ? currentVersion : 1;
    const validTotalVersions = Number.isFinite(totalVersions) ? totalVersions : 0;

    // Smart pagination: always show first and last versions, always render up to 5 version numbers
    const getVersionNumbers = (): (number | "ellipsis")[] => {
        if (validTotalVersions <= 0) return [];
        if (validTotalVersions === 1) return [1];
        if (validTotalVersions <= 5) {
            return Array.from({ length: validTotalVersions }, (_, i) => i + 1);
        }

        const versions: (number | "ellipsis")[] = [];
        const safeVersion = Math.max(1, Math.min(validCurrentVersion, validTotalVersions));

        // Always start with version 1
        versions.push(1);

        // Calculate the 3 middle version numbers
        let middleStart: number;
        let middleEnd: number;

        if (safeVersion <= 3) {
            middleStart = 2;
            middleEnd = 4;
        } else if (safeVersion >= validTotalVersions - 2) {
            middleStart = validTotalVersions - 3;
            middleEnd = validTotalVersions - 1;
        } else {
            middleStart = safeVersion - 1;
            middleEnd = safeVersion + 1;
        }

        if (middleStart > 2) {
            versions.push("ellipsis");
        }

        for (let i = middleStart; i <= middleEnd; i++) {
            if (i > 1 && i < validTotalVersions) {
                versions.push(i);
            }
        }

        if (middleEnd < validTotalVersions - 1) {
            versions.push("ellipsis");
        }

        versions.push(validTotalVersions);

        return versions;
    };

    const versionNumbers = getVersionNumbers();

    if (validTotalVersions <= 1) {
        return null;
    }

    return (
        <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground font-medium">Version</span>
            <Pagination className="justify-start w-auto mx-0">
                <PaginationContent>
                    {versionNumbers.map((version, index) => (
                        <PaginationItem
                            key={
                                version === "ellipsis"
                                    ? `ellipsis-${index}`
                                    : version
                            }
                        >
                            {version === "ellipsis" ? (
                                <span className="flex items-center justify-center w-9 h-8.5 text-muted-foreground">
                                    ...
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onVersionChange(version)}
                                    style={{ backgroundColor: "var(--background)" }}
                                    className={cn(
                                        "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                        "w-9 h-8.5 px-3 font-bold text-sm border border-solid",
                                        "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                        "text-muted-foreground hover:text-foreground",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        validCurrentVersion === version &&
                                            "border-muted-foreground/30 text-foreground",
                                    )}
                                >
                                    {version}
                                </button>
                            )}
                        </PaginationItem>
                    ))}
                </PaginationContent>
            </Pagination>
        </div>
    );
}
