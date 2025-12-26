import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/header/AppHeader";
import { Footer } from "@/components/layout/Footer";
import { cn } from "@/lib/utils";
import { CheckCircle, Sparkles, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import * as v from "valibot";

const searchSchema = v.object({
    checkout_id: v.optional(v.string()),
});

export const Route = createFileRoute("/checkout/success")({
    validateSearch: searchSchema,
    component: CheckoutSuccessPage,
});

function CheckoutSuccessPage() {
    const queryClient = useQueryClient();

    useEffect(() => {
        queryClient.invalidateQueries({ queryKey: ["customer-state"] });
    }, [queryClient]);
    return (
        <div className="min-h-screen-dynamic flex flex-col">
            <AppHeader />
            <main className="h-viewport-content overflow-y-auto flex flex-col items-center justify-center p-4 mb-4">
                <div className="w-full max-w-md text-center">
                    <div className="mb-6">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-4">
                            <CheckCircle className="w-10 h-10 text-green-500" />
                        </div>
                        <h1 className="text-3xl font-bold font-poppins-bold text-foreground mb-2">
                            Welcome to Pro!
                        </h1>
                        <p className="text-muted-foreground text-lg">
                            Your subscription is now active
                        </p>
                    </div>

                    <div className="space-y-4 mb-8">
                        <div className="p-4 rounded-lg border border-solid border-input bg-background/50">
                            <div className="flex items-center gap-3 justify-center">
                                <Sparkles className="w-5 h-5 text-muted-foreground" />
                                <span className="text-foreground font-medium">
                                    300 AI generations ready to use
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Link
                            to="/"
                            style={{ backgroundColor: "var(--background)" }}
                            className={cn(
                                "disable-animation-on-theme-change w-full",
                                "inline-flex items-center justify-center gap-2 rounded-md",
                                "font-medium text-base h-11 px-6 border border-solid",
                                "border-muted-foreground/30 text-foreground",
                                "hover:border-muted-foreground/50 hover:bg-background/60",
                                "transition-colors duration-200 cursor-pointer",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            )}
                        >
                            Start Creating
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    <p className="text-xs text-muted-foreground mt-6">
                        You can manage your subscription anytime from the{" "}
                        <Link
                            to="/pricing"
                            className="underline hover:text-foreground transition-colors"
                        >
                            pricing page
                        </Link>
                    </p>
                </div>
            </main>
            <Footer />
        </div>
    );
}
