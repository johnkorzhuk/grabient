import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useStore } from "@tanstack/react-store";
import { consentStore, updateConsent } from "@/stores/consent-store";

export function ConsentSection({ id }: { id?: string }) {
    const consentState = useStore(consentStore);

    const handleAnalyticsChange = (checked: boolean) => {
        updateConsent({ analytics: checked });
    };

    const handleSessionReplayChange = (checked: boolean) => {
        updateConsent({ sessionReplay: checked });
    };

    const handleAdvertisingChange = (checked: boolean) => {
        updateConsent({ advertising: checked });
    };

    return (
        <Card id={id} className={id ? "scroll-mt-24" : undefined}>
            <CardHeader>
                <CardTitle>Privacy & Consent</CardTitle>
                <CardDescription className="font-system">
                    Manage your data privacy and cookie preferences
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-1">
                        <Label
                            htmlFor="analytics"
                            className="text-sm font-medium cursor-pointer"
                        >
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
                        <Label
                            htmlFor="sessionReplay"
                            className="text-sm font-medium cursor-pointer"
                        >
                            Session Replay
                        </Label>
                        <p className="text-xs text-muted-foreground font-system">
                            Anonymized session recordings to help us fix issues
                        </p>
                    </div>
                    <Switch
                        id="sessionReplay"
                        checked={consentState.categories.sessionReplay}
                        onCheckedChange={handleSessionReplayChange}
                        className="disable-animation-on-theme-change cursor-pointer"
                    />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-1">
                        <Label
                            htmlFor="advertising"
                            className="text-sm font-medium cursor-pointer"
                        >
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
