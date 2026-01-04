import { collectSubscription, validPayment } from "@/core/functions/payments";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useEffect } from "react";
import { isProEnabled } from "@/lib/feature-flags";

const searchSchema = z.object({
    checkout_id: z.string(),
});

export const Route = createFileRoute("/app/polar/checkout/success")({
    component: RouteComponent,
    validateSearch: (search) => searchSchema.parse(search),
    beforeLoad: async ({ search }) => {
        if (!isProEnabled()) {
            throw redirect({ to: "/" });
        }
        const session = await authClient.getSession();
        if (!session) {
            throw redirect({
                to: "/login",
                search: {
                    redirect: "/app/polar/checkout/success",
                },
            });
        }
        return search;
    },
    loader: async (input) => {
        const isValid = await validPayment({
            data: input.context.checkout_id,
        });
        return {
            isValid,
            checkoutId: input.context.checkout_id,
        };
    },
    errorComponent: ({ error }) => {
        return (
            <div className="h-ful flex flex-col items-center justify-center bg-background px-6 py-12">
                <div className="max-w-lg w-full text-center space-y-8">
                    <div className="flex justify-center">
                        <AlertCircle className="w-16 h-16 text-destructive" />
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-4xl font-bold tracking-tight">
                            Payment Error
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-md mx-auto leading-relaxed">
                            An error occurred while processing your payment.
                        </p>
                    </div>

                    <div className="pt-8">
                        <p className="text-sm text-muted-foreground font-mono">
                            {error.message}
                        </p>
                    </div>
                </div>
            </div>
        );
    },
});

function RouteComponent() {
    const loaderData = Route.useLoaderData();
    const nav = Route.useNavigate();
    const queryClient = useQueryClient();

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: [loaderData.checkoutId],
        queryFn: collectSubscription,
        refetchInterval: (query) => {
            if (!query.state.data) {
                return 2000;
            }
            return false;
        },
    });

    useEffect(() => {
        if (data) {
            queryClient.invalidateQueries({ queryKey: ["customer-state"] });
        }
    }, [data, queryClient]);

    const getStatus = () => {
        if (error) return "error";
        if (data) return "success";
        if (isFetching || isLoading) return "processing";
        return "processing";
    };

    const status = getStatus();

    const getStatusIcon = () => {
        switch (status) {
            case "success":
                return <CheckCircle2 className="w-16 h-16 text-primary" />;
            case "error":
                return <AlertCircle className="w-16 h-16 text-destructive" />;
            default:
                return (
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                );
        }
    };

    const getStatusMessage = () => {
        switch (status) {
            case "success":
                return {
                    title: "Payment Successful!",
                    description:
                        "Your subscription has been activated successfully.",
                };
            case "error":
                return {
                    title: "Payment Processing Error",
                    description:
                        "There was an issue processing your payment. Please contact support.",
                };
            default:
                return {
                    title: "Processing Your Payment",
                    description:
                        "We're verifying your payment details. This may take a few moments...",
                };
        }
    };

    const { title, description } = getStatusMessage();

    return (
        <div className="h-full flex flex-col items-center justify-center bg-background px-6 py-12">
            <div className="max-w-lg w-full text-center space-y-8">
                <div className="flex justify-center">{getStatusIcon()}</div>

                <div className="space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">
                        {title}
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-md mx-auto leading-relaxed">
                        {description}
                    </p>
                </div>

                <div className="space-y-6">
                    {status === "success" && (
                        <Button
                            onClick={() => nav({ to: "/" })}
                            size="lg"
                            className="px-8 py-3"
                        >
                            Continue to Home
                        </Button>
                    )}

                    {status === "error" && (
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button
                                onClick={() => window.location.reload()}
                                variant="outline"
                                size="lg"
                                className="px-6"
                            >
                                Try Again
                            </Button>
                            <Button
                                onClick={() =>
                                    nav({ to: "/app/polar/subscriptions" })
                                }
                                size="lg"
                                className="px-6"
                            >
                                Back to Plans
                            </Button>
                        </div>
                    )}
                </div>

                <div className="pt-8">
                    <p className="text-sm text-muted-foreground">
                        Transaction ID:{" "}
                        <span className="font-mono text-foreground">
                            {loaderData.checkoutId.slice(-8)}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    );
}
