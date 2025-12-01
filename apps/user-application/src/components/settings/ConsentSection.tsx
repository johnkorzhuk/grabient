import { useState, useEffect } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useStore } from "@tanstack/react-store";
import { consentStore, updateConsent } from "@/stores/consent-store";
import { isCookieYesConfigured, isCookieYesReady } from "@/integrations/cookieyes/consent";

const CONSENT_REQUIRED_LAWS = ["gdpr", "ccpa", "lgpd", "popia", "pipeda"];

function isConsentRequiredRegion(activeLaw: string): boolean {
    return CONSENT_REQUIRED_LAWS.includes(activeLaw.toLowerCase());
}

export function ConsentSection() {
    const cookieYesEnabled = isCookieYesConfigured();
    const [isRegulated, setIsRegulated] = useState<boolean | null>(null);
    const [isReady, setIsReady] = useState(false);
    const consentState = useStore(consentStore);

    useEffect(() => {
        if (!cookieYesEnabled) {
            setIsRegulated(false);
            setIsReady(true);
            return;
        }

        const checkCookieYes = () => {
            if (isCookieYesReady()) {
                try {
                    const consent = getCkyConsent();
                    setIsRegulated(isConsentRequiredRegion(consent.activeLaw));
                    setIsReady(true);
                } catch {
                    setIsRegulated(false);
                    setIsReady(true);
                }
            }
        };

        checkCookieYes();

        const handleBannerLoad = () => {
            checkCookieYes();
        };

        document.addEventListener("cookieyes_banner_load", handleBannerLoad);

        return () => {
            document.removeEventListener("cookieyes_banner_load", handleBannerLoad);
        };
    }, [cookieYesEnabled]);

    const handleAnalyticsChange = (checked: boolean) => {
        updateConsent({ analytics: checked });
    };

    const handleSessionReplayChange = (checked: boolean) => {
        updateConsent({ sessionReplay: checked });
    };

    const handleAdvertisingChange = (checked: boolean) => {
        updateConsent({ advertising: checked });
    };

    if (!isReady) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle>Privacy & Consent</CardTitle>
                            <CardDescription className="font-system">
                                Manage your data privacy and cookie preferences
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>
        );
    }

    if (isRegulated) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle>Privacy & Consent</CardTitle>
                            <CardDescription className="font-system">
                                Manage your data privacy and cookie preferences
                            </CardDescription>
                        </div>
                        <Button className="cky-banner-element disable-animation-on-theme-change cursor-pointer">
                            Manage cookie preferences
                        </Button>
                    </div>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Privacy & Consent</CardTitle>
                <CardDescription className="font-system">
                    Manage your data privacy and cookie preferences
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-1">
                        <Label htmlFor="analytics" className="text-sm font-medium cursor-pointer">
                            Analytics
                        </Label>
                        <p className="text-xs text-muted-foreground font-system">
                            Help us improve by allowing anonymous usage analytics
                        </p>
                    </div>
                    <Switch
                        id="analytics"
                        checked={consentState.categories.analytics}
                        onCheckedChange={handleAnalyticsChange}
                        className="disable-animation-on-theme-change cursor-pointer"
                    />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-1">
                        <Label htmlFor="session-replay" className="text-sm font-medium cursor-pointer">
                            Session replay
                        </Label>
                        <p className="text-xs text-muted-foreground font-system">
                            Allow recording of your session to help us debug issues
                        </p>
                    </div>
                    <Switch
                        id="session-replay"
                        checked={consentState.categories.sessionReplay}
                        onCheckedChange={handleSessionReplayChange}
                        className="disable-animation-on-theme-change cursor-pointer"
                    />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-1">
                        <Label htmlFor="advertising" className="text-sm font-medium cursor-pointer">
                            Marketing
                        </Label>
                        <p className="text-xs text-muted-foreground font-system">
                            Allow personalized ads and marketing content
                        </p>
                    </div>
                    <Switch
                        id="advertising"
                        checked={consentState.categories.advertising}
                        onCheckedChange={handleAdvertisingChange}
                        className="disable-animation-on-theme-change cursor-pointer"
                    />
                </div>
            </CardContent>
        </Card>
    );
}
