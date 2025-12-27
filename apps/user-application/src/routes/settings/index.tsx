import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AppHeader } from "@/components/header/AppHeader";
import { LogOut, ArrowLeft, ExternalLink } from "lucide-react";
import { SettingsSolid } from "@/components/icons/SettingsSolid";
import { useState, useEffect, useRef } from "react";
import * as v from "valibot";
import { useForm } from "@tanstack/react-form";
import {
    deleteAccount,
    checkUsernameAvailability,
} from "@/server-functions/auth";
import { usernameSchema } from "@repo/data-ops/valibot-schema/auth";
import type { AuthUser } from "@repo/data-ops/auth/client-types";
import { useUpdateUsernameMutation } from "@/mutations/auth";
import {
    AvatarUpload,
    type AvatarUploadHandle,
} from "@/components/AvatarUpload";
import { ConsentSection } from "@/components/settings/ConsentSection";
import { useCustomerState } from "@/hooks/useCustomerState";

const searchSchema = v.object({
    token: v.optional(v.string()),
});

export const Route = createFileRoute("/settings/")({
    validateSearch: (search) => v.parse(searchSchema, search),
    component: SettingsPage,
});

function SettingsPage() {
    const {
        data: session,
        isPending,
        refetch: refetchSession,
    } = authClient.useSession();
    const user = session?.user as AuthUser | undefined;
    const search = Route.useSearch();
    const router = useRouter();
    const [deletionEmailSent, setDeletionEmailSent] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [verificationError, setVerificationError] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const avatarRef = useRef<AvatarUploadHandle>(null);

    const updateUsernameMutation = useUpdateUsernameMutation();
    const { data: customerState, isLoading: customerStateLoading } = useCustomerState();

    const fallbackText = user?.username
        ? user.username.charAt(0).toUpperCase()
        : user?.email?.charAt(0).toUpperCase() || "U";

    const usernameForm = useForm({
        defaultValues: {
            username: user?.username || "",
        },
        onSubmit: async ({ value }) => {
            const hasAvatarChanges = avatarRef.current?.hasChanges;
            const hasUsernameChanges =
                value.username !== (user?.username || "");

            if (hasAvatarChanges) {
                await avatarRef.current?.uploadIfChanged();
            }

            if (hasUsernameChanges) {
                await updateUsernameMutation.mutateAsync({
                    username: value.username,
                });
                await refetchSession();
            }
        },
    });

    useEffect(() => {
        if (user?.username) {
            usernameForm.setFieldValue("username", user.username);
        }
    }, [user?.username]);

    useEffect(() => {
        if (
            updateUsernameMutation.isSuccess ||
            updateUsernameMutation.isError
        ) {
            updateUsernameMutation.reset();
        }
    }, [usernameForm.state.values.username]);

    useEffect(() => {
        if (search.token && user) {
            const dangerZone = document.getElementById("danger-zone");
            if (dangerZone) {
                dangerZone.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }
        }
    }, [search.token, user]);

    if (isPending) {
        return null;
    }

    const handleSignOut = async () => {
        await authClient.signOut();
        await router.invalidate();
        router.navigate({ to: "/" });
    };

    const handleDeleteAccount = async () => {
        try {
            if (search.token) {
                setVerifying(true);
                await deleteAccount({ data: { token: search.token } });
                await authClient.signOut();
                await router.invalidate();
            } else {
                const response = await authClient.deleteUser();
                if (response.error) {
                    console.error(
                        "Failed to send deletion email:",
                        response.error,
                    );
                    return;
                }
                setDeletionEmailSent(true);
            }
        } catch (error) {
            console.error("Failed to delete account:", error);
            setVerificationError(true);
            setVerifying(false);
        }
    };

    const subscription = customerState?.activeSubscriptions?.[0];
    const hasSubscription = (customerState?.activeSubscriptions?.length ?? 0) > 0;

    const handlePortal = async () => {
        try {
            await authClient.customer.portal();
        } catch (error) {
            console.error("Portal error:", error);
        }
    };

    const formatDate = (dateString: string | Date | null | undefined) => {
        if (!dateString) return "N/A";
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    const getStatusBadge = (status: string | undefined) => {
        switch (status) {
            case "active":
                return { text: "Active", className: "bg-green-500/10 text-green-600 border-green-500/20" };
            case "trialing":
                return { text: "Trial", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" };
            case "past_due":
                return { text: "Past Due", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
            case "canceled":
                return { text: "Canceled", className: "bg-red-500/10 text-red-600 border-red-500/20" };
            default:
                return { text: status || "Unknown", className: "bg-muted text-muted-foreground border-border" };
        }
    };

    const navItems = [
        { id: "profile", label: "Profile" },
        ...(user ? [
            { id: "subscription", label: "Subscription" },
            { id: "account", label: "Account" },
        ] : []),
        { id: "privacy", label: "Privacy" },
        ...(user ? [
            { id: "danger-zone", label: "Danger Zone" },
        ] : []),
    ];

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    return (
        <div className="min-h-screen-dynamic bg-background">
            <AppHeader />
            <main className="container mx-auto px-4 py-6 lg:py-12">
                <div className="flex gap-8 max-w-5xl mx-auto">
                    {/* Sidebar Navigation */}
                    <nav className="hidden lg:block w-48 flex-shrink-0">
                        <div className="sticky top-24 space-y-1">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => scrollToSection(item.id)}
                                    className={cn(
                                        "w-full text-left px-3 py-2 text-sm rounded-md",
                                        "text-muted-foreground hover:text-foreground",
                                        "hover:bg-muted/50 transition-colors duration-200",
                                        "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </nav>

                    {/* Main Content */}
                    <div className="flex-1 max-w-3xl space-y-6 lg:space-y-8">
                        <div className="flex items-start gap-6">
                            <SettingsSolid className="w-12 h-12 text-foreground shrink-0 mt-1.5" />
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight">
                                    Settings
                                </h1>
                                <p className="text-muted-foreground font-system">
                                    Manage your account settings and preferences
                                </p>
                            </div>
                        </div>

                    {/* Profile Section */}
                    <Card id="profile" className="relative scroll-mt-24">
                        <CardHeader>
                            <CardTitle>Profile</CardTitle>
                            <CardDescription className="font-system">
                                Update your profile information and avatar
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center gap-6">
                                <Avatar className="h-20 w-20">
                                    <AvatarImage
                                        src={
                                            avatarPreview ||
                                            user?.image ||
                                            undefined
                                        }
                                        alt={user?.username || "User"}
                                    />
                                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                                        {fallbackText}
                                    </AvatarFallback>
                                </Avatar>
                                <AvatarUpload
                                    ref={avatarRef}
                                    onPreviewChange={setAvatarPreview}
                                    onUploadSuccess={refetchSession}
                                />
                            </div>

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    usernameForm.handleSubmit();
                                }}
                            >
                                <div className="space-y-4">
                                    <usernameForm.Field
                                        name="username"
                                        validators={{
                                            onChange: ({ value }) => {
                                                if (!value) return undefined;
                                                const result = v.safeParse(
                                                    usernameSchema,
                                                    value,
                                                );
                                                if (!result.success) {
                                                    return (
                                                        result.issues[0]
                                                            ?.message ||
                                                        "Invalid username"
                                                    );
                                                }
                                                return undefined;
                                            },
                                            onChangeAsyncDebounceMs: 500,
                                            onChangeAsync: async ({
                                                value,
                                                fieldApi,
                                            }) => {
                                                if (
                                                    !value ||
                                                    value === user?.username
                                                ) {
                                                    return undefined;
                                                }

                                                if (
                                                    !fieldApi.state.meta
                                                        .isTouched
                                                ) {
                                                    return undefined;
                                                }

                                                const result = v.safeParse(
                                                    usernameSchema,
                                                    value,
                                                );
                                                if (!result.success) {
                                                    return undefined;
                                                }

                                                try {
                                                    const availabilityResult =
                                                        await checkUsernameAvailability(
                                                            {
                                                                data: {
                                                                    username:
                                                                        value,
                                                                },
                                                            },
                                                        );
                                                    if (
                                                        !availabilityResult.available
                                                    ) {
                                                        return "Username already taken";
                                                    }
                                                } catch (error) {
                                                    console.error(
                                                        "Failed to check username:",
                                                        error,
                                                    );
                                                    return "Unable to check username availability";
                                                }
                                                return undefined;
                                            },
                                        }}
                                    >
                                        {(field) => (
                                            <div className="space-y-2">
                                                <div className="w-full flex items-center justify-between min-h-5">
                                                    <Label htmlFor={field.name}>
                                                        Username
                                                    </Label>
                                                    <span>
                                                        {field.state.meta
                                                            .isValidating && (
                                                            <p
                                                                className="text-sm text-muted-foreground"
                                                                style={{
                                                                    fontFamily:
                                                                        "system-ui, -apple-system, sans-serif",
                                                                    fontWeight: 500,
                                                                }}
                                                            >
                                                                Checking
                                                                availability...
                                                            </p>
                                                        )}
                                                        {!field.state.meta
                                                            .isValidating &&
                                                            field.state.meta
                                                                .errors.length >
                                                                0 && (
                                                                <p
                                                                    className="text-sm text-red-500"
                                                                    style={{
                                                                        fontFamily:
                                                                            "system-ui, -apple-system, sans-serif",
                                                                        fontWeight: 500,
                                                                    }}
                                                                >
                                                                    {
                                                                        field
                                                                            .state
                                                                            .meta
                                                                            .errors[0]
                                                                    }
                                                                </p>
                                                            )}
                                                        {!field.state.meta
                                                            .isValidating &&
                                                            field.state.meta
                                                                .errors
                                                                .length === 0 &&
                                                            updateUsernameMutation.isSuccess &&
                                                            field.state.value === (user?.username || "") && (
                                                                <p
                                                                    className="text-sm text-green-600 dark:text-green-400"
                                                                    style={{
                                                                        fontFamily:
                                                                            "system-ui, -apple-system, sans-serif",
                                                                        fontWeight: 500,
                                                                    }}
                                                                >
                                                                    Username
                                                                    updated
                                                                    successfully
                                                                </p>
                                                            )}
                                                        {updateUsernameMutation.isError && (
                                                            <p
                                                                className="text-sm text-red-500"
                                                                style={{
                                                                    fontFamily:
                                                                        "system-ui, -apple-system, sans-serif",
                                                                    fontWeight: 500,
                                                                }}
                                                            >
                                                                Failed to update
                                                                username
                                                            </p>
                                                        )}
                                                    </span>
                                                </div>
                                                <input
                                                    id={field.name}
                                                    name={field.name}
                                                    type="text"
                                                    placeholder="Choose a username"
                                                    value={field.state.value}
                                                    onChange={(e) =>
                                                        field.handleChange(
                                                            e.target.value,
                                                        )
                                                    }
                                                    onBlur={field.handleBlur}
                                                    className="disable-animation-on-theme-change w-full h-10 px-3 text-sm font-poppins bg-background border border-solid border-input rounded-md text-foreground placeholder:text-muted-foreground hover:border-muted-foreground/50 hover:bg-background/60 focus:border-muted-foreground/70 focus:bg-background/60 outline-none transition-colors duration-200"
                                                />
                                            </div>
                                        )}
                                    </usernameForm.Field>

                                    <usernameForm.Subscribe
                                        selector={(state) => ({
                                            isSubmitting: state.isSubmitting,
                                            canSubmit: state.canSubmit,
                                            isValidating: state.isValidating,
                                            username: state.values.username,
                                        })}
                                    >
                                        {(state) => {
                                            const hasUsernameChanged =
                                                state.username !==
                                                (user?.username || "");
                                            const hasAvatarChanged =
                                                avatarRef.current?.hasChanges ||
                                                false;
                                            const hasChanges =
                                                hasUsernameChanged ||
                                                hasAvatarChanged;
                                            const canSave =
                                                state.canSubmit &&
                                                hasChanges &&
                                                !updateUsernameMutation.isPending &&
                                                !state.isValidating &&
                                                !state.isSubmitting;

                                            return (
                                                <div className="flex justify-end mt-6">
                                                    <Button
                                                        type="submit"
                                                        disabled={!canSave}
                                                        className="disable-animation-on-theme-change cursor-pointer"
                                                    >
                                                        {state.isSubmitting ||
                                                        updateUsernameMutation.isPending
                                                            ? "Saving..."
                                                            : "Save changes"}
                                                    </Button>
                                                </div>
                                            );
                                        }}
                                    </usernameForm.Subscribe>
                                </div>
                            </form>
                        </CardContent>
                        {!user && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm rounded-lg animate-in fade-in duration-500">
                                <div className="text-center space-y-2">
                                    <h3 className="disable-animation-on-theme-change text-xl font-semibold">
                                        Sign up to manage your profile
                                    </h3>
                                    <p className="disable-animation-on-theme-change text-sm text-muted-foreground font-system max-w-md">
                                        Create an account to customize your
                                        username, upload an avatar, and manage
                                        your settings
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Link
                                        to="/"
                                        style={{
                                            backgroundColor:
                                                "var(--background)",
                                        }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                            "font-medium text-sm h-10.5 pl-5 pr-6 border border-solid",
                                            "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                            "text-muted-foreground hover:text-foreground",
                                            "transition-colors duration-200 cursor-pointer",
                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        )}
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-2" />
                                        Home
                                    </Link>
                                    <Link
                                        to="/login"
                                        search={{
                                            redirect: "/settings",
                                        }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                            "font-medium text-sm h-10.5 px-6 border border-solid",
                                            "bg-foreground hover:bg-foreground/90",
                                            "border-foreground hover:border-foreground/70",
                                            "text-background hover:text-background",
                                            "transition-colors duration-200 cursor-pointer",
                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                        )}
                                    >
                                        Sign up
                                    </Link>
                                </div>
                            </div>
                        )}
                    </Card>

                    {user && (
                        <>
                            {/* Subscription Section */}
                            <Card id="subscription" className="scroll-mt-24">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle>Subscription</CardTitle>
                                            <CardDescription className="font-system">
                                                Manage your plan and billing
                                            </CardDescription>
                                        </div>
                                        {hasSubscription && (
                                            <span className={cn(
                                                "px-2.5 py-1 text-xs font-medium rounded-full border",
                                                getStatusBadge(subscription?.status).className
                                            )}>
                                                {getStatusBadge(subscription?.status).text}
                                            </span>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {customerStateLoading ? (
                                        <div className="space-y-4">
                                            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                                            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                                        </div>
                                    ) : hasSubscription ? (
                                        <>
                                            <div className="space-y-4">
                                                {subscription?.status === "trialing" && subscription?.trialEnd ? (
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">Trial ends</p>
                                                        <p className="text-sm font-medium">{formatDate(subscription.trialEnd)}</p>
                                                    </div>
                                                ) : subscription?.currentPeriodEnd && (
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">
                                                            {subscription?.cancelAtPeriodEnd ? "Access until" : "Next billing"}
                                                        </p>
                                                        <p className="text-sm font-medium">{formatDate(subscription.currentPeriodEnd)}</p>
                                                    </div>
                                                )}

                                                {(() => {
                                                    const meter = customerState?.activeMeters?.find(m => m.creditedUnits > 0) ?? customerState?.activeMeters?.[0];
                                                    return meter && (
                                                        <div className="space-y-1">
                                                            <p className="text-sm text-muted-foreground">AI Generations</p>
                                                            <p className="text-sm font-medium">
                                                                {meter.consumedUnits} / {meter.creditedUnits} used
                                                            </p>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {subscription?.cancelAtPeriodEnd && (
                                                <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                                                    <p className="text-xs text-amber-600">
                                                        Your subscription will cancel at the end of the billing period
                                                    </p>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between pt-4 border-t border-border">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">Grabient Pro</p>
                                                    <p className="text-xs text-muted-foreground font-system">
                                                        {subscription?.status === "trialing"
                                                            ? "Your free trial is active"
                                                            : "Full access to all Pro features"}
                                                    </p>
                                                </div>
                                                <Button
                                                    onClick={handlePortal}
                                                    variant="outline"
                                                    size="sm"
                                                    className="disable-animation-on-theme-change cursor-pointer"
                                                >
                                                    Manage
                                                    <ExternalLink className="h-3 w-3 ml-1.5 text-muted-foreground" />
                                                </Button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="rounded-lg border border-border p-4">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">Free Plan</p>
                                                    <p className="text-xs text-muted-foreground font-system">
                                                        Upgrade to Pro for AI palette generation and more
                                                    </p>
                                                </div>
                                                <Link
                                                    to="/pricing"
                                                    className={cn(
                                                        "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                                        "font-medium text-sm h-9 px-4 border border-solid",
                                                        "bg-foreground hover:bg-foreground/90",
                                                        "border-foreground hover:border-foreground/70",
                                                        "text-background hover:text-background",
                                                        "transition-colors duration-200 cursor-pointer",
                                                        "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                    )}
                                                >
                                                    Upgrade
                                                </Link>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Account Section */}
                            <Card id="account" className="scroll-mt-24">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle>Account</CardTitle>
                                            <CardDescription className="font-system">
                                                Manage your account settings
                                            </CardDescription>
                                        </div>
                                        <Button
                                            variant="destructive"
                                            onClick={handleSignOut}
                                            className="disable-animation-on-theme-change cursor-pointer"
                                        >
                                            <LogOut className="h-4 w-4 mr-2" />
                                            Sign out
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">
                                                Account Created
                                            </p>
                                            <p className="text-xs text-muted-foreground font-system">
                                                {user?.createdAt
                                                    ? new Date(
                                                          user.createdAt,
                                                      ).toLocaleDateString(
                                                          "en-US",
                                                          {
                                                              year: "numeric",
                                                              month: "long",
                                                              day: "numeric",
                                                          },
                                                      )
                                                    : "Unknown"}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between rounded-lg border border-border p-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">
                                                Email Verification
                                            </p>
                                            <p className="text-xs text-muted-foreground font-system">
                                                {user?.email || "No email"} is{" "}
                                                {user?.emailVerified
                                                    ? "verified"
                                                    : "not verified"}
                                            </p>
                                        </div>
                                        {user?.emailVerified ? (
                                            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                                <svg
                                                    className="h-5 w-5"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M5 13l4 4L19 7"
                                                    />
                                                </svg>
                                                Verified
                                            </div>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled
                                                className="disable-animation-on-theme-change"
                                            >
                                                Verify Email
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {/* Privacy & Consent Section */}
                    <ConsentSection id="privacy" />

                    {user && (
                        <>
                            {/* Danger Zone */}
                            <Card
                                id="danger-zone"
                                className="border-destructive scroll-mt-24"
                            >
                                <CardHeader>
                                    <CardTitle className="text-destructive">
                                        Danger Zone
                                    </CardTitle>
                                    <CardDescription className="font-system">
                                        Irreversible actions for your account
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between rounded-lg border border-destructive/50 p-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">
                                                {verifying
                                                    ? "Verifying..."
                                                    : verificationError
                                                      ? "Verification failed"
                                                      : deletionEmailSent
                                                        ? "Check your email"
                                                        : search.token
                                                          ? "Confirm delete"
                                                          : "Delete account"}
                                            </p>
                                            <p className="text-xs text-muted-foreground font-system">
                                                {verifying
                                                    ? "Deleting your account..."
                                                    : verificationError
                                                      ? "This link may have expired or is invalid"
                                                      : deletionEmailSent
                                                        ? "We sent a confirmation link to your email address"
                                                        : search.token
                                                          ? "Click the button to confirm account deletion"
                                                          : "Permanently delete your account and all data"}
                                            </p>
                                        </div>
                                        <Button
                                            variant="destructive"
                                            onClick={handleDeleteAccount}
                                            className="disable-animation-on-theme-change cursor-pointer"
                                            disabled={
                                                deletionEmailSent || verifying
                                            }
                                        >
                                            {search.token
                                                ? "Confirm delete"
                                                : "Delete account"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                    </div>
                </div>
            </main>
        </div>
    );
}
