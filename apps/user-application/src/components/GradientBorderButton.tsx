import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import { paletteAnimationStore } from "@/stores/palette-animation";

interface GradientBorderButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}

const FIXED_STOP_COUNT = 10;
const TWEEN_DURATION = 2000; // Duration to tween between palette changes

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

export function GradientBorderButton({
    children,
    onClick,
    disabled,
    className,
}: GradientBorderButtonProps) {
    const [isHovered, setIsHovered] = useState(false);
    const svgId = useRef(`gradient-btn-${Math.random().toString(36).slice(2)}`);

    // Get target colors from the shared store (synced with GrabientLogo)
    const targetColors = useStore(paletteAnimationStore, (state) => state.normalizedColors);

    // State for the displayed colors (tweened)
    const [displayedColors, setDisplayedColors] = useState<string[]>(
        () => Array(FIXED_STOP_COUNT).fill("#888888")
    );

    // Refs for animation
    const animationRef = useRef<number | null>(null);
    const tweenStateRef = useRef<{
        startColors: string[];
        endColors: string[];
        startTime: number;
    } | null>(null);

    // Effect to start tweening when target colors change
    useEffect(() => {
        if (targetColors.length === 0) return;

        // Start a new tween
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

        // Cancel any existing animation
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [targetColors]);

    const currentColors = displayedColors;

    const gradientId = svgId.current;
    const glowFilterId = `${gradientId}-glow`;

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
            className={cn("relative z-0", className)}
            style={{ backgroundColor: "var(--background)" }}
        >
            {/* Outer glow layer */}
            <svg
                className={cn(
                    "pointer-events-none absolute -inset-[12px] w-[calc(100%+24px)] h-[calc(100%+24px)] -z-20 transition-opacity duration-500",
                    isHovered ? "opacity-50" : "opacity-0"
                )}
                preserveAspectRatio="none"
            >
                <defs>
                    <linearGradient id={`${gradientId}-outer`} x1="0%" y1="0%" x2="100%" y2="0%">
                        {currentColors.map((color, i) => (
                            <stop
                                key={i}
                                offset={`${(i / (FIXED_STOP_COUNT - 1)) * 100}%`}
                                stopColor={color}
                            />
                        ))}
                    </linearGradient>
                    <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="6" result="blur" />
                    </filter>
                    {/* Mask for edge fade */}
                    <radialGradient id={`${gradientId}-fade`} cx="50%" cy="50%" r="60%" fx="50%" fy="50%">
                        <stop offset="0%" stopColor="white" stopOpacity="1" />
                        <stop offset="60%" stopColor="white" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                    <mask id={`${gradientId}-mask`}>
                        <rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId}-fade)`} />
                    </mask>
                </defs>
                <rect
                    x="8"
                    y="8"
                    width="calc(100% - 16px)"
                    height="calc(100% - 16px)"
                    rx="8"
                    ry="8"
                    fill={`url(#${gradientId}-outer)`}
                    filter={`url(#${glowFilterId})`}
                    mask={`url(#${gradientId}-mask)`}
                />
            </svg>
            {/* SVG gradient border */}
            <svg
                className={cn(
                    "pointer-events-none absolute -inset-[2px] w-[calc(100%+4px)] h-[calc(100%+4px)] -z-10 transition-opacity duration-300",
                    isHovered ? "opacity-100" : "opacity-0"
                )}
                preserveAspectRatio="none"
            >
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                        {currentColors.map((color, i) => (
                            <stop
                                key={i}
                                offset={`${(i / (FIXED_STOP_COUNT - 1)) * 100}%`}
                                stopColor={color}
                            />
                        ))}
                    </linearGradient>
                </defs>
                <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    rx="6"
                    ry="6"
                    fill={`url(#${gradientId})`}
                />
            </svg>
            {/* Inner background to create border effect */}
            <div
                className={cn(
                    "pointer-events-none absolute inset-0 rounded-[5px] -z-[5] transition-shadow duration-300",
                    isHovered && "shadow-[inset_0_0_16px_rgba(255,255,255,0.15)]"
                )}
                style={{ backgroundColor: "var(--background)" }}
            />
            <span className="relative">
                {/* Solid text layer - fades to 70% on hover */}
                <span
                    className="transition-opacity duration-300"
                    style={{ opacity: isHovered ? 0.7 : 1 }}
                >
                    {children}
                </span>
                {/* Gradient text layer - fades in on hover */}
                <span
                    className="absolute inset-0 bg-clip-text text-transparent transition-opacity duration-300"
                    style={{
                        backgroundImage: `linear-gradient(90deg, ${currentColors.map((c, i) => `${c} ${(i / (FIXED_STOP_COUNT - 1)) * 100}%`).join(", ")})`,
                        opacity: isHovered ? 1 : 0,
                    }}
                    aria-hidden="true"
                >
                    {children}
                </span>
            </span>
        </button>
    );
}
