import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isCookieYesConfigured } from "@/integrations/cookieyes/consent";

export function ConsentSection() {
    const cookieYesEnabled = isCookieYesConfigured();

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
                    {cookieYesEnabled && (
                        <button
                            className={cn(
                                "cky-banner-element",
                                "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                "font-medium text-sm h-9 px-4 border border-solid",
                                "bg-foreground hover:bg-foreground/90",
                                "border-foreground hover:border-foreground/70",
                                "text-background hover:text-background",
                                "transition-colors duration-200 cursor-pointer",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            )}
                        >
                            Manage Cookie Preferences
                        </button>
                    )}
                </div>
            </CardHeader>
        </Card>
    );
}
