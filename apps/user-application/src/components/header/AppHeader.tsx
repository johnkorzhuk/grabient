import { ThemeToggle } from "@/components/theme/theme-toggle";
import { EyeDropper } from "@/components/ui/eye-dropper";
import {
    Link,
    useMatches,
    useLocation,
    useRouter,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { GrabientLogoContainer } from "@/components/GrabientLogoContainer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { SettingsSolid } from "@/components/icons/SettingsSolid";
import { useFocusTrap } from "@mantine/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/theme/theme-provider";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";
import type { AuthUser } from "@repo/data-ops/auth/client-types";
import { SearchInput } from "@/components/search/SearchInput";

export function AppHeader({ className }: { className?: string }) {
    const matches = useMatches();
    const location = useLocation();
    const router = useRouter();
    const seedRouteMatch = matches.find((match) => match.routeId === "/$seed");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const { data: session, isPending } = authClient.useSession();
    const focusTrapRef = useFocusTrap(dropdownOpen);
    const { resolved: theme } = useTheme();
    const previousRouteHref = useStore(uiStore, (state) => state.previousRouteHref);
    const navSelect = useStore(uiStore, (state) => state.navSelect);

    const handleSignOut = async () => {
        await authClient.signOut();
        await router.invalidate();
    };

    const user = session?.user as AuthUser | undefined;
    const fallbackText = user?.username
        ? user.username.charAt(0).toUpperCase()
        : user?.email?.charAt(0).toUpperCase() || "U";

    return (
        <header
            className={cn(
                "disable-animation-on-theme-change sticky top-0 z-[100] w-full bg-background",
                className,
            )}
            suppressHydrationWarning
        >
            <div className="mx-auto flex w-full items-center justify-between px-5 lg:px-14 py-3 lg:py-5">
                <nav
                    className="flex items-center gap-6 md:gap-10"
                    aria-label="Primary navigation"
                >
                    <Link
                        to={seedRouteMatch ? (previousRouteHref ?? navSelect) : "/"}
                        className="flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-md"
                        aria-label="Grabient home"
                    >
                        <GrabientLogoContainer className="h-11 md:h-12 w-auto" />
                    </Link>
                </nav>

                <div className="hidden md:block flex-1 max-w-xs mx-6">
                    <SearchInput />
                </div>

                <div className="flex items-center gap-3 md:gap-6">
                    <div className="flex items-center gap-2">
                        <EyeDropper />
                        <ThemeToggle />
                    </div>

                    <div className="flex items-center">
                        {isPending && (
                            <Skeleton className="h-10 w-10 rounded-full" />
                        )}

                        {!isPending && session && (
                            <DropdownMenu
                                open={dropdownOpen}
                                onOpenChange={setDropdownOpen}
                            >
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="relative h-10 w-10 rounded-full hover:bg-accent cursor-pointer"
                                        aria-label="User menu"
                                    >
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage
                                                src={user?.image || undefined}
                                                alt={
                                                    user?.username ||
                                                    user?.email ||
                                                    "User avatar"
                                                }
                                            />
                                            <AvatarFallback className="bg-primary/10 text-primary">
                                                {fallbackText}
                                            </AvatarFallback>
                                        </Avatar>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    ref={focusTrapRef}
                                    className="disable-animation-on-theme-change w-56 bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md p-1.5 md:data-[side=bottom]:left-auto md:data-[side=bottom]:right-full md:data-[side=bottom]:translate-x-[-0.5rem] lg:data-[side=bottom]:left-auto lg:data-[side=bottom]:right-0 lg:data-[side=bottom]:translate-x-0"
                                    align="end"
                                    sideOffset={9}
                                    suppressHydrationWarning
                                >
                                    <DropdownMenuLabel className="font-normal px-3 py-2">
                                        <div className="flex flex-col space-y-1">
                                            {user?.username && (
                                                <p className="text-sm font-medium leading-none text-foreground">
                                                    {user.username}
                                                </p>
                                            )}
                                            {user?.email && (
                                                <p className="text-xs leading-none text-muted-foreground">
                                                    {user.email}
                                                </p>
                                            )}
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-border/40" />
                                    <DropdownMenuItem
                                        asChild
                                        className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3"
                                    >
                                        <Link to="/settings">
                                            <SettingsSolid
                                                className="mr-2 h-4 w-4"
                                                style={{
                                                    color: "currentColor",
                                                }}
                                                aria-hidden="true"
                                            />
                                            <span className="font-medium text-sm">
                                                Settings
                                            </span>
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-border/40" />
                                    <DropdownMenuItem
                                        onClick={handleSignOut}
                                        className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3"
                                    >
                                        <LogOut
                                            className="mr-2 h-4 w-4"
                                            style={{ color: "currentColor" }}
                                            strokeWidth={3.5}
                                            aria-hidden="true"
                                        />
                                        <span className="font-medium text-sm">
                                            Sign out
                                        </span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {!isPending && !session && (
                            <Link
                                to="/login"
                                search={{ redirect: location.pathname }}
                            >
                                <button
                                    style={{
                                        backgroundColor: "var(--background)",
                                        fontFamily:
                                            "system-ui, -apple-system, sans-serif",
                                    }}
                                    className={cn(
                                        "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                        "h-8.5 px-3 border border-solid",
                                        "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                        "text-muted-foreground hover:text-foreground",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        "font-medium text-sm",
                                    )}
                                    suppressHydrationWarning
                                >
                                    Sign in
                                </button>
                            </Link>
                        )}
                    </div>
                </div>
            </div>
            <div
                suppressHydrationWarning
                className={cn("block w-full px-5 lg:px-14")}
            >
                <div
                    suppressHydrationWarning
                    className={cn("h-[1px] w-full", {
                        "opacity-50": theme === "dark",
                        "opacity-80": theme === "light",
                    })}
                    style={{
                        backgroundImage:
                            "linear-gradient(to right, var(--muted-foreground) 0%, var(--muted-foreground) 2px, transparent 2px, transparent 12px)",
                        backgroundSize: "6px 1px",
                    }}
                />
            </div>
        </header>
    );
}
