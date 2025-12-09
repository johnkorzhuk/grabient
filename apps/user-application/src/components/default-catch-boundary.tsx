import { Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import {
    AlertTriangle,
    RefreshCw,
    ArrowLeft,
    Home,
    ChevronDown,
    Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
    const router = useRouter();
    const isRoot = useMatch({
        strict: false,
        select: (state) => state.id === rootRouteId,
    });
    const [showDetails, setShowDetails] = useState(false);

    console.error(error);

    const errorMessage = error?.message || "An unexpected error occurred";
    const errorStack = error?.stack || "";
    const hasStack = errorStack.length > 0;

    return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl">
                <CardHeader>
                    <div className="flex items-center space-x-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                        </div>
                        <div>
                            <CardTitle className="text-xl">
                                Something went wrong
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                We encountered an unexpected error. Please try
                                again.
                            </p>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Error Alert */}
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="font-medium">
                            {errorMessage}
                        </AlertDescription>
                    </Alert>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                            onClick={() => router.invalidate()}
                            className="flex items-center gap-2"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Try Again
                        </Button>

                        {isRoot ? (
                            <Button variant="outline" asChild>
                                <Link
                                    to="/"
                                    className="flex items-center gap-2"
                                >
                                    <Home className="h-4 w-4" />
                                    Go to Home
                                </Link>
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={() => window.history.back()}
                                className="flex items-center gap-2"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Go Back
                            </Button>
                        )}
                    </div>

                    {/* Error Details (Collapsible) */}
                    {hasStack && (
                        <Collapsible
                            open={showDetails}
                            onOpenChange={setShowDetails}
                        >
                            <CollapsibleTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                                >
                                    <Bug className="h-4 w-4" />
                                    Technical Details
                                    <ChevronDown
                                        className={`h-4 w-4 transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`}
                                    />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-2">
                                <div className="rounded-lg bg-muted p-4">
                                    <h4 className="text-sm font-medium mb-2">
                                        Error Stack Trace:
                                    </h4>
                                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                        {errorStack}
                                    </pre>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    )}

                    {/* Help Section */}
                    <div className="border-t pt-4">
                        <p className="text-sm text-muted-foreground">
                            Our team has been notified.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
