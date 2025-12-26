import { ThemeToggle } from "@/components/theme/theme-toggle";
import { EyeDropper } from "@/components/ui/eye-dropper";
import {
    Link,
    useMatches,
    useLocation,
    useRouter,
    useSearch,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
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
import { LogOut, Check, Rocket } from "lucide-react";
import { SettingsSolid } from "@/components/icons/SettingsSolid";
import { useFocusTrap } from "@mantine/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/theme/theme-provider";
import { useHasActiveSubscription } from "@/hooks/useCustomerState";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";
import { paletteAnimationStore } from "@/stores/palette-animation";
import type { AuthUser } from "@repo/data-ops/auth/client-types";
import type { SizeType } from "@/stores/export";
import { styleWithAutoValidator } from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";

export interface LogoNavigation {
    to: string;
    search?: Record<string, unknown>;
}

const FIXED_STOP_COUNT = 10;
const TWEEN_DURATION = 2000;

function interpolateColor(color1: string, color2: string, factor: number): string {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function AppHeader({ className, logoNavigation }: { className?: string; logoNavigation?: LogoNavigation }) {
    const matches = useMatches();
    const location = useLocation();
    const router = useRouter();
    const seedRouteMatch = matches.find((match) => match.routeId === "/$seed");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const { data: session, isPending } = authClient.useSession();
    const { hasSubscription } = useHasActiveSubscription();
    const targetColors = useStore(paletteAnimationStore, (state) => state.normalizedColors);
    const [displayedColors, setDisplayedColors] = useState<string[]>(
        () => Array(FIXED_STOP_COUNT).fill("#888888")
    );
    const animationRef = useRef<number | null>(null);
    const tweenStateRef = useRef<{
        startColors: string[];
        endColors: string[];
        startTime: number;
    } | null>(null);

    useEffect(() => {
        if (targetColors.length === 0) return;

        tweenStateRef.current = {
            startColors: [...displayedColors],
            endColors: [...targetColors],
            startTime: performance.now(),
        };

        const animate = (currentTime: number) => {
            const state = tweenStateRef.current;
            if (!state) return;

            const elapsed = currentTime - state.startTime;
            const progress = Math.min(elapsed / TWEEN_DURATION, 1);

            const interpolated = state.startColors.map((startColor, i) => {
                const endColor = state.endColors[i] || startColor;
                return interpolateColor(startColor, endColor, progress);
            });

            setDisplayedColors(interpolated);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                tweenStateRef.current = null;
            }
        };

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [targetColors]);

    const focusTrapRef = useFocusTrap(dropdownOpen);
    const { resolved: theme } = useTheme();
    const previousRoute = useStore(uiStore, (state) => state.previousRoute);
    const navSelect = useStore(uiStore, (state) => state.navSelect);
    const seedInitialSearch = useStore(uiStore, (state) => state.seedInitialSearch);
    const currentSearch = useSearch({ strict: false }) as {
        size?: SizeType;
        style?: v.InferOutput<typeof styleWithAutoValidator>;
        angle?: number | "auto";
        steps?: number | "auto";
    };

    const handleSignOut = async () => {
        await authClient.signOut();
        await router.invalidate();
    };

    const user = session?.user as AuthUser | undefined;
    const fallbackText = user?.username
        ? user.username.charAt(0).toUpperCase()
        : user?.email?.charAt(0).toUpperCase() || "U";

    const logoPath = logoNavigation?.to ?? (seedRouteMatch ? (previousRoute?.path ?? navSelect) : "/");

    // When on seed route, only retain params the user explicitly changed
    const buildSeedRouteSearch = () => {
        // Extract size from previousRoute.search to handle it separately
        // This prevents stale size values from being used
        const { size: _prevSize, ...baseWithoutSize } = previousRoute?.search ?? {};

        if (!seedInitialSearch) {
            return {
                ...baseWithoutSize,
                ...(currentSearch.size && currentSearch.size !== "auto" ? { size: currentSearch.size } : {}),
            };
        }

        // Get current values from URL (undefined or "auto" means use initial)
        const currentStyle = !currentSearch.style || currentSearch.style === "auto" ? seedInitialSearch.style : currentSearch.style;
        const currentAngle = currentSearch.angle == null || currentSearch.angle === "auto" ? seedInitialSearch.angle : currentSearch.angle;
        const currentSteps = currentSearch.steps == null || currentSearch.steps === "auto" ? seedInitialSearch.steps : currentSearch.steps;

        return {
            ...baseWithoutSize,
            // Only include if user changed from initial
            ...(currentStyle !== seedInitialSearch.style ? { style: currentStyle } : {}),
            ...(currentAngle !== seedInitialSearch.angle ? { angle: currentAngle } : {}),
            ...(currentSteps !== seedInitialSearch.steps ? { steps: currentSteps } : {}),
            // Always include size if not auto (size is a user preference)
            // Use current URL's size, not the stale previousRoute size
            ...(currentSearch.size && currentSearch.size !== "auto" ? { size: currentSearch.size } : {}),
        };
    };

    const logoSearch = logoNavigation?.search ?? (seedRouteMatch ? buildSeedRouteSearch() : undefined);

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
                        to={logoPath}
                        search={logoSearch}
                        className="flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-md"
                        aria-label="Grabient home"
                    >
                        <GrabientLogoContainer className="h-11 md:h-12 w-auto" />
                    </Link>
                </nav>

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
                                    {hasSubscription ? (
                                        <div className="flex items-center px-3 py-2">
                                            <Rocket
                                                className="mr-4 h-4 w-4 flex-shrink-0"
                                                style={{ color: "currentColor" }}
                                                aria-hidden="true"
                                            />
                                            <span className="font-bold text-sm">Grabient</span>
                                            <span className="relative -mt-px ml-1">
                                                <span className="text-base font-bold">Pro</span>
                                                <span
                                                    className="absolute left-0 right-0 bottom-[-1px] h-[4px] rounded-full"
                                                    style={{
                                                        backgroundImage: `linear-gradient(90deg, ${displayedColors.join(", ")})`,
                                                    }}
                                                />
                                            </span>
                                        </div>
                                    ) : (
                                        <DropdownMenuItem
                                            asChild
                                            className="cursor-pointer relative h-9 min-h-[2.25rem] text-foreground/80 hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground px-3"
                                        >
                                            <Link to="/pricing" className="flex items-center">
                                                <Rocket
                                                    className="mr-2 h-4 w-4"
                                                    style={{ color: "currentColor" }}
                                                    aria-hidden="true"
                                                />
                                                <span className="flex items-baseline gap-1">
                                                    <span className="font-medium text-sm">
                                                        Upgrade to
                                                    </span>
                                                    <span className="relative -mt-px ml-px">
                                                        <span className="text-base font-bold">Pro</span>
                                                        <span
                                                            className="absolute left-0 right-0 bottom-[-1px] h-[4px] rounded-full"
                                                            style={{
                                                                backgroundImage: `linear-gradient(90deg, ${displayedColors.join(", ")})`,
                                                            }}
                                                        />
                                                    </span>
                                                </span>
                                            </Link>
                                        </DropdownMenuItem>
                                    )}
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
                                    className={cn(
                                        "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                        "h-8 px-2.5 border border-solid border-transparent",
                                        "bg-foreground/80 text-background hover:bg-foreground/90",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        "font-medium text-xs",
                                    )}
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
