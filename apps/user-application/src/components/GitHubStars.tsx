import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { githubStarsQueryOptions } from "@/server-functions/github-stars";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { cn } from "@/lib/utils";

interface GitHubStarsProps {
    className?: string;
}

function formatStars(stars: number): string {
    if (stars >= 1000) {
        return `${(stars / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    }
    return stars.toString();
}

export function GitHubStars({ className }: GitHubStarsProps) {
    const { data: stars } = useQuery(githubStarsQueryOptions());

    return (
        <a
            href="https://github.com/johnkorzhuk/grabient"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-200",
                className,
            )}
            aria-label={`GitHub repository${stars ? ` - ${stars} stars` : ""}`}
        >
            <GitHubIcon className="h-5 w-5" />
            <span className="font-poppins text-base sm:text-lg mr-1">GitHub</span>
            {stars !== undefined && stars > 0 && (
                <span className="flex items-center gap-1 font-poppins text-base sm:text-lg">
                    <Star
                        className="h-4 w-4"
                        fill="#f59e0b"
                        stroke="#f59e0b"
                        aria-hidden="true"
                    />
                    {formatStars(stars)}
                </span>
            )}
        </a>
    );
}
