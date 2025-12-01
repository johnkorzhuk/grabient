import { useStore } from "@tanstack/react-store";
import { useState, useEffect, useRef } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import {
    consentStore,
    updateConsent,
    acceptAllConsent,
    rejectAllConsent,
} from "@/stores/consent-store";

interface ConsentToggleProps {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
}

function ConsentToggle({
    id,
    label,
    description,
    checked,
    disabled = false,
    onChange,
}: ConsentToggleProps) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-1 flex-1">
                <Label
                    htmlFor={id}
                    className={disabled ? "" : "cursor-pointer"}
                >
                    {label}
                </Label>
                <p className="text-xs text-muted-foreground font-system">
                    {description}
                </p>
            </div>
            <div className="relative inline-block pl-4">
                <input
                    type="checkbox"
                    id={id}
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.checked)}
                    className="sr-only peer"
                />
                <label
                    htmlFor={id}
                    className={`block w-11 h-6 rounded-full transition-colors duration-200 ${
                        disabled
                            ? "bg-foreground/60 cursor-not-allowed"
                            : "cursor-pointer peer-checked:bg-foreground bg-input peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70"
                    }`}
                >
                    <span
                        className={`block w-5 h-5 bg-background rounded-full transition-transform duration-200 translate-y-0.5 ${
                            checked ? "translate-x-5.5" : "translate-x-0.5"
                        }`}
                    />
                </label>
            </div>
        </div>
    );
}

export function ConsentSection() {
    const consentState = useStore(consentStore);
    const initialAnalyticsConsent = useRef(consentState.categories.analytics);
    const [showReloadButton, setShowReloadButton] = useState(false);

    useEffect(() => {
        if (consentState.categories.analytics !== initialAnalyticsConsent.current) {
            setShowReloadButton(true);
        } else {
            setShowReloadButton(false);
        }
    }, [consentState.categories.analytics]);

    const handleCategoryChange = (
        category: "analytics" | "sessionReplay",
        value: boolean,
    ) => {
        updateConsent({ [category]: value });
    };

    const handleReload = () => {
        window.location.reload();
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle>Privacy & Consent</CardTitle>
                        <CardDescription className="font-system">
                            Manage your data privacy preferences
                        </CardDescription>
                    </div>
                    {showReloadButton && (
                        <button
                            onClick={handleReload}
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
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reload page
                        </button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <ConsentToggle
                    id="consent-necessary"
                    label="Necessary"
                    description="Required for the application to function properly."
                    checked={true}
                    disabled={true}
                    onChange={() => {}}
                />

                <ConsentToggle
                    id="consent-analytics"
                    label="Analytics"
                    description="Help us improve by collecting anonymous usage statistics and performance metrics."
                    checked={consentState.categories.analytics}
                    onChange={(checked) =>
                        handleCategoryChange("analytics", checked)
                    }
                />

                <ConsentToggle
                    id="consent-session-replay"
                    label="Session Replay"
                    description="Record anonymized sessions to help us understand user interactions."
                    checked={consentState.categories.sessionReplay}
                    onChange={(checked) =>
                        handleCategoryChange("sessionReplay", checked)
                    }
                />

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={rejectAllConsent}
                        style={{
                            backgroundColor: "var(--background)",
                        }}
                        className={cn(
                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                            "font-medium text-sm h-9 px-4 border border-solid",
                            "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                            "text-muted-foreground hover:text-foreground",
                            "transition-colors duration-200 cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        )}
                    >
                        Reject all
                    </button>
                    <button
                        onClick={acceptAllConsent}
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
                        Accept all
                    </button>
                </div>
            </CardContent>
        </Card>
    );
}
