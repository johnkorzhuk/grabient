import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authClient } from "@/lib/auth-client";
import { AppHeader } from "@/components/header/AppHeader";
import { Footer } from "@/components/layout/Footer";
import { cn } from "@/lib/utils";
import * as v from "valibot";
import {
    loginSearchSchema,
    loginEmailSchema,
} from "@repo/data-ops/valibot-schema/auth";

export const Route = createFileRoute("/login")({
    validateSearch: loginSearchSchema,
    component: LoginPage,
});

function LoginPage() {
    const search = Route.useSearch();
    const redirectUrl = search.redirect;

    const [isLoading, setIsLoading] = useState(false);
    const [magicLinkSent, setMagicLinkSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryTimer, setRetryTimer] = useState(0);
    const [lastSentEmail, setLastSentEmail] = useState("");

    const form = useForm({
        defaultValues: {
            email: "",
        },
        onSubmit: async ({ value }) => {
            setIsLoading(true);
            setError(null);

            try {
                v.parse(loginEmailSchema, value);
                await authClient.signIn.magicLink({
                    email: value.email,
                    callbackURL: redirectUrl,
                });
                setMagicLinkSent(true);
                setLastSentEmail(value.email);
                setRetryTimer(30);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to send magic link",
                );
            } finally {
                setIsLoading(false);
            }
        },
    });

    useEffect(() => {
        if (retryTimer > 0) {
            const timer = setTimeout(() => {
                setRetryTimer(retryTimer - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [retryTimer]);

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setError(null);

        try {
            await authClient.signIn.social({
                provider: "google",
                callbackURL: redirectUrl,
            });
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to sign in with Google",
            );
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen-dynamic flex flex-col">
            <AppHeader />
            <main className="h-viewport-content overflow-y-auto flex items-center justify-center p-4 mb-4">
                <div className="w-full max-w-md">
                    <h1 className="text-2xl font-bold font-poppins-bold text-foreground mb-6 text-center">
                        Welcome to Grabient
                    </h1>
                    <div className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Google OAuth */}
                        <button
                            onClick={handleGoogleSignIn}
                            disabled={isLoading}
                            style={{
                                backgroundColor: "var(--background)",
                                fontFamily:
                                    "system-ui, -apple-system, sans-serif",
                            }}
                            className={cn(
                                "disable-animation-on-theme-change w-full inline-flex items-center justify-center rounded-md",
                                "font-medium text-base h-10 px-3 border border-solid",
                                "border-input text-muted-foreground",
                                "hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
                                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-input disabled:hover:bg-background disabled:hover:text-muted-foreground",
                                "transition-colors duration-200 cursor-pointer",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            )}
                        >
                            <img
                                src="/Google.svg"
                                alt="Google"
                                className="mr-2 h-5 w-5"
                            />
                            Sign in with Google
                        </button>

                        {/* Magic Link Form */}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                form.handleSubmit();
                            }}
                            noValidate
                        >
                            <div className="space-y-4">
                                <form.Field
                                    name="email"
                                    validators={{
                                        onChange: ({ value, fieldApi }) => {
                                            if (
                                                !fieldApi.state.meta.isTouched
                                            ) {
                                                return undefined;
                                            }
                                            try {
                                                v.parse(
                                                    loginEmailSchema.entries
                                                        .email,
                                                    value,
                                                );
                                                return undefined;
                                            } catch (error) {
                                                if (v.isValiError(error)) {
                                                    const message =
                                                        error.issues[0]
                                                            ?.message ||
                                                        "Invalid email";
                                                    if (
                                                        message ===
                                                        "Email is required"
                                                    ) {
                                                        return undefined;
                                                    }
                                                    return message;
                                                }
                                                return "Invalid email";
                                            }
                                        },
                                        onBlur: ({ value }) => {
                                            try {
                                                v.parse(
                                                    loginEmailSchema.entries
                                                        .email,
                                                    value,
                                                );
                                                return undefined;
                                            } catch (error) {
                                                if (v.isValiError(error)) {
                                                    const message =
                                                        error.issues[0]
                                                            ?.message ||
                                                        "Invalid email";
                                                    if (
                                                        message ===
                                                        "Email is required"
                                                    ) {
                                                        return undefined;
                                                    }
                                                    return message;
                                                }
                                                return "Invalid email";
                                            }
                                        },
                                    }}
                                >
                                    {(field) => {
                                        const dividerText =
                                            field.state.meta.errors.length >
                                                0 && field.state.meta.isTouched
                                                ? field.state.meta.errors[0]
                                                : magicLinkSent
                                                  ? "Check your email"
                                                  : "Or continue with email";

                                        return (
                                            <div className="space-y-2">
                                                <div className="relative mb-3">
                                                    <div className="absolute inset-0 flex items-center">
                                                        <div
                                                            className="w-full h-[1px]"
                                                            style={{
                                                                backgroundImage:
                                                                    "linear-gradient(to right, var(--ring) 0%, var(--ring) 2px, transparent 2px, transparent 12px)",
                                                                backgroundSize:
                                                                    "6px 1px",
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="relative flex justify-center text-xs uppercase">
                                                        <span
                                                            className={cn(
                                                                "bg-background px-2 font-bold",
                                                                field.state.meta
                                                                    .errors
                                                                    .length >
                                                                    0 &&
                                                                    field.state
                                                                        .meta
                                                                        .isTouched
                                                                    ? "text-red-500"
                                                                    : "text-muted-foreground",
                                                            )}
                                                            style={{
                                                                fontFamily:
                                                                    "system-ui, -apple-system, sans-serif",
                                                            }}
                                                        >
                                                            {dividerText}
                                                        </span>
                                                    </div>
                                                </div>
                                                <input
                                                    id={field.name}
                                                    name={field.name}
                                                    type="email"
                                                    placeholder="name@example.com"
                                                    value={
                                                        field.state.value || ""
                                                    }
                                                    onChange={(e) => {
                                                        field.handleChange(
                                                            e.target.value,
                                                        );
                                                        if (
                                                            magicLinkSent &&
                                                            e.target.value !==
                                                                lastSentEmail
                                                        ) {
                                                            setMagicLinkSent(
                                                                false,
                                                            );
                                                            setRetryTimer(0);
                                                        }
                                                    }}
                                                    onBlur={field.handleBlur}
                                                    disabled={isLoading}
                                                    className={cn(
                                                        "disable-animation-on-theme-change",
                                                        "w-full h-10 px-3 text-sm font-poppins",
                                                        "bg-background border border-solid border-input rounded-md",
                                                        "text-foreground placeholder:text-muted-foreground",
                                                        "hover:border-muted-foreground/50 hover:bg-background/60",
                                                        "focus:border-muted-foreground/70 focus:bg-background/60",
                                                        "outline-none",
                                                        "transition-colors duration-200",
                                                    )}
                                                    suppressHydrationWarning
                                                />
                                            </div>
                                        );
                                    }}
                                </form.Field>

                                <form.Subscribe
                                    selector={(state) => ({
                                        emailValue: state.values.email,
                                        isSubmitting: state.isSubmitting,
                                    })}
                                >
                                    {(state) => {
                                        const isEmailValid = (() => {
                                            try {
                                                v.parse(
                                                    loginEmailSchema.entries
                                                        .email,
                                                    state.emailValue,
                                                );
                                                return true;
                                            } catch {
                                                return false;
                                            }
                                        })();

                                        const getButtonText = () => {
                                            if (isLoading) return "Sending...";
                                            if (magicLinkSent) {
                                                return retryTimer > 0
                                                    ? `Retry (${retryTimer}s)`
                                                    : "Retry";
                                            }
                                            return "Send magic link";
                                        };

                                        return (
                                            <button
                                                type="submit"
                                                disabled={
                                                    !isEmailValid ||
                                                    state.isSubmitting ||
                                                    isLoading ||
                                                    retryTimer > 0
                                                }
                                                style={{
                                                    backgroundColor:
                                                        "var(--background)",
                                                    fontFamily:
                                                        "system-ui, -apple-system, sans-serif",
                                                }}
                                                className={cn(
                                                    "disable-animation-on-theme-change",
                                                    "w-full inline-flex items-center justify-center rounded-md",
                                                    "font-medium text-base h-10 px-3 border border-solid",
                                                    "border-input text-muted-foreground",
                                                    "hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground",
                                                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-input disabled:hover:bg-background disabled:hover:text-muted-foreground",
                                                    "transition-colors duration-200 cursor-pointer",
                                                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                )}
                                                suppressHydrationWarning
                                            >
                                                {getButtonText()}
                                            </button>
                                        );
                                    }}
                                </form.Subscribe>
                            </div>
                        </form>

                        <p
                            className="text-xs text-muted-foreground text-center"
                            style={{
                                fontFamily:
                                    "system-ui, -apple-system, sans-serif",
                            }}
                        >
                            By continuing, you agree to our{" "}
                            <Link
                                to="/terms"
                                className="underline hover:text-foreground transition-colors"
                            >
                                Terms of Service
                            </Link>{" "}
                            and{" "}
                            <Link
                                to="/privacy"
                                className="underline hover:text-foreground transition-colors"
                            >
                                Privacy Policy
                            </Link>
                            .
                        </p>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
