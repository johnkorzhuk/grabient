import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/header/AppHeader";
import { Footer } from "@/components/layout/Footer";
import { cn } from "@/lib/utils";
import { authClient, useSession } from "@/lib/auth-client";
import { useHasActiveSubscription } from "@/hooks/useCustomerState";
import { Check, X, Sparkles } from "lucide-react";
import { useState } from "react";
import { GradientBorderButton } from "@/components/GradientBorderButton";

export const Route = createFileRoute("/pricing")({
    component: PricingPage,
});

const FREE_FEATURES = [
    { text: "Browse community palettes", included: true },
    { text: "Vector search palettes", included: true },
    { text: "Export gradients", included: true },
    { text: "Save favorites", included: true },
    { text: "AI palette generation", included: false },
];

const PRO_FEATURES = [
    { text: "Everything in Free", included: true },
    { text: "300 AI palette generations/month", included: true },
    { text: "7-day free trial", included: true },
    { text: "Cancel anytime", included: true },
    { text: "Support indie development", included: true },
    { text: "More coming soon", included: true, muted: true },
];

function PricingPage() {
    const { data: session, isPending: sessionPending } = useSession();
    const { hasSubscription, isLoading: subscriptionLoading } = useHasActiveSubscription();
    const [isYearly, setIsYearly] = useState(true);
    const [checkoutLoading, setCheckoutLoading] = useState(false);

    const currentPlan = isYearly
        ? { slug: "pro-yearly", price: "$30", period: "/year", monthly: "$2.50/mo" }
        : { slug: "pro-monthly", price: "$3", period: "/month", monthly: null };

    const handleCheckout = async () => {
        if (!session) return;
        setCheckoutLoading(true);
        try {
            await authClient.checkout({ slug: currentPlan.slug });
        } catch (error) {
            console.error("Checkout error:", error);
            setCheckoutLoading(false);
        }
    };

    const handlePortal = async () => {
        try {
            await authClient.customer.portal();
        } catch (error) {
            console.error("Portal error:", error);
        }
    };

    const isLoading = sessionPending || subscriptionLoading;

    return (
        <div className="min-h-screen-dynamic flex flex-col">
            <AppHeader />
            <main className="flex-1 overflow-y-auto flex flex-col items-center py-8 md:py-12 px-4">
                <div className="w-full max-w-4xl">
                    <div className="text-center mb-10">
                        <h1 className="text-3xl md:text-4xl font-bold font-poppins-bold text-foreground">
                            Choose your plan
                        </h1>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                        {/* Free Plan */}
                        <div className="p-6 rounded-xl border border-solid border-input bg-background/50 flex flex-col">
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-foreground mb-1">Free</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    For casual browsing
                                </p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-bold text-foreground">$0</span>
                                    <span className="text-muted-foreground">/forever</span>
                                </div>
                                <p className="text-sm mt-1 h-5 text-transparent select-none">
                                    placeholder
                                </p>
                            </div>

                            <ul className="space-y-3 mb-6 flex-1">
                                {FREE_FEATURES.map((feature, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                        {feature.included ? (
                                            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                        ) : (
                                            <X className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                                        )}
                                        <span className={cn(
                                            "text-sm",
                                            feature.included ? "text-muted-foreground" : "text-muted-foreground/50"
                                        )}>
                                            {feature.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            {hasSubscription ? (
                                <button
                                    onClick={handlePortal}
                                    style={{ backgroundColor: "var(--background)" }}
                                    className={cn(
                                        "disable-animation-on-theme-change w-full",
                                        "inline-flex items-center justify-center rounded-md",
                                        "font-medium text-base h-11 px-6 border border-solid",
                                        "border-input text-muted-foreground",
                                        "hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                    )}
                                >
                                    Downgrade
                                </button>
                            ) : (
                                <Link
                                    to="/"
                                    style={{ backgroundColor: "var(--background)" }}
                                    className={cn(
                                        "disable-animation-on-theme-change w-full",
                                        "inline-flex items-center justify-center rounded-md",
                                        "font-medium text-base h-11 px-6 border border-solid",
                                        "border-input text-muted-foreground",
                                        "hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                    )}
                                >
                                    Get Started
                                </Link>
                            )}
                        </div>

                        {/* Pro Plan */}
                        <div className="relative p-6 rounded-xl border border-solid border-muted-foreground/30 bg-background/50">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                <span className="px-3 py-1 text-xs font-bold bg-foreground text-background rounded-full flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    Pro
                                </span>
                            </div>

                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-foreground mb-1">Pro</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    For creators & designers
                                </p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-bold text-foreground">
                                        {currentPlan.price}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {currentPlan.period}
                                    </span>
                                </div>
                                <p className={cn(
                                    "text-sm mt-1 h-5",
                                    isYearly ? "text-green-600" : "text-transparent select-none"
                                )}>
                                    $2.50/mo · Save $6
                                </p>
                            </div>

                            {/* Billing Toggle - hide when subscribed */}
                            {!hasSubscription && (
                                <div className="flex items-center justify-center gap-3 mb-6 p-1 rounded-lg bg-muted/30">
                                    <button
                                        onClick={() => setIsYearly(false)}
                                        className={cn(
                                            "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
                                            !isYearly
                                                ? "bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Monthly
                                    </button>
                                    <button
                                        onClick={() => setIsYearly(true)}
                                        className={cn(
                                            "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
                                            isYearly
                                                ? "bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Yearly
                                    </button>
                                </div>
                            )}

                            {/* Current plan badge when subscribed */}
                            {hasSubscription && (
                                <div className="flex items-center justify-center gap-2 mb-6 py-2 px-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                    <Check className="w-4 h-4 text-green-500" />
                                    <span className="text-sm font-medium text-green-600">Current Plan</span>
                                </div>
                            )}

                            <ul className="space-y-3 mb-6">
                                {PRO_FEATURES.map((feature, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                        <Check className={cn(
                                            "w-4 h-4 flex-shrink-0",
                                            feature.muted ? "text-muted-foreground/50" : "text-green-500"
                                        )} />
                                        <span className={cn(
                                            "text-sm",
                                            feature.muted ? "text-muted-foreground/50 italic" : "text-muted-foreground"
                                        )}>
                                            {feature.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            {hasSubscription ? (
                                <button
                                    onClick={handlePortal}
                                    style={{ backgroundColor: "var(--background)" }}
                                    className={cn(
                                        "disable-animation-on-theme-change w-full",
                                        "inline-flex items-center justify-center rounded-md",
                                        "font-medium text-base h-11 px-6 border border-solid",
                                        "border-muted-foreground/30 text-foreground",
                                        "hover:border-muted-foreground/50 hover:bg-background/60",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                    )}
                                >
                                    Manage Subscription
                                </button>
                            ) : session ? (
                                <GradientBorderButton
                                    onClick={handleCheckout}
                                    disabled={checkoutLoading || isLoading}
                                    className={cn(
                                        "disable-animation-on-theme-change w-full",
                                        "inline-flex items-center justify-center rounded-md",
                                        "font-medium text-base h-11 px-6 border border-solid",
                                        "border-muted-foreground/30 text-foreground",
                                        "hover:border-transparent",
                                        "disabled:opacity-50 disabled:cursor-not-allowed",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none",
                                    )}
                                >
                                    {checkoutLoading ? "Loading..." : "Start Free Trial"}
                                </GradientBorderButton>
                            ) : (
                                <Link
                                    to="/login"
                                    search={{ redirect: "/pricing" }}
                                    style={{ backgroundColor: "var(--background)" }}
                                    className={cn(
                                        "disable-animation-on-theme-change w-full",
                                        "inline-flex items-center justify-center rounded-md",
                                        "font-medium text-base h-11 px-6 border border-solid",
                                        "border-muted-foreground/30 text-foreground",
                                        "hover:border-muted-foreground/50 hover:bg-background/60",
                                        "transition-colors duration-200 cursor-pointer",
                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                    )}
                                >
                                    Sign in to Start
                                </Link>
                            )}
                        </div>
                    </div>

                    <p className="text-center text-xs text-muted-foreground mt-8">
                        Secure payment powered by{" "}
                        <a
                            href="https://polar.sh"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-foreground transition-colors"
                        >
                            Polar
                        </a>
                    </p>
                </div>
            </main>
            <Footer />
        </div>
    );
}
