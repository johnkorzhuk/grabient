import { PrimaryDivider } from "./Divider";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

interface FooterProps {
    className?: string;
}

export function Footer({ className }: FooterProps) {
    const currentYear = new Date().getFullYear();

    return (
        <footer className={cn("relative pb-8 pt-0 lg:pb-13", className)}>
            <div className="relative">
                <PrimaryDivider />
            </div>
            <div className="px-5 lg:px-14 pt-5 lg:pt-13 pb-2 flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-0">
                <div className="flex items-center gap-3 sm:gap-6 flex-wrap justify-center sm:justify-start">
                    <a
                        href="https://iquilezles.org/articles/palettes/"
                        className="text-muted-foreground hover:text-foreground transition-colors duration-200 font-poppins text-base sm:text-lg"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        About
                    </a>
                    <div className="h-4 w-px bg-muted-foreground/30"></div>
                    <Link
                        to="/contact"
                        className="text-muted-foreground hover:text-foreground transition-colors duration-200 font-poppins text-base sm:text-lg"
                    >
                        Contact
                    </Link>
                    <div className="h-4 w-px bg-muted-foreground/30"></div>
                    <Link
                        to="/privacy"
                        className="text-muted-foreground hover:text-foreground transition-colors duration-200 font-poppins text-base sm:text-lg"
                    >
                        Privacy
                    </Link>
                    <div className="h-4 w-px bg-muted-foreground/30"></div>
                    <Link
                        to="/terms"
                        className="text-muted-foreground hover:text-foreground transition-colors duration-200 font-poppins text-base sm:text-lg"
                    >
                        Terms
                    </Link>
                </div>

                <div className="text-muted-foreground font-poppins text-xs sm:text-sm">
                    <span>©{currentYear} Grabient</span>
                </div>
            </div>
        </footer>
    );
}
