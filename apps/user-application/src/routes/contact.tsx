import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import * as v from "valibot";
import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { sendContactEmail } from "@/server-functions/contact";
import {
    contactFormSchema,
    emailFieldSchema,
    type ContactFormData,
} from "@repo/data-ops/valibot-schema/contact";

export const Route = createFileRoute("/contact")({
    component: RouteComponent,
});

function RouteComponent() {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <AppLayout showNavigation={false}>
            <ContactPage />
        </AppLayout>
    );
}

const SUBJECT_OPTIONS = [
    { value: "feedback", label: "Feedback" },
    { value: "bug-report", label: "Bug Report" },
    { value: "feature-request", label: "Feature Request" },
    { value: "other", label: "Other" },
] as const;

function ContactPage() {
    const [subjectOpen, setSubjectOpen] = useState(false);
    const [customSubject, setCustomSubject] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const navigate = useNavigate();
    const subjectInputRef = useRef<HTMLInputElement>(null);
    const sendEmail = useServerFn(sendContactEmail);

    const form = useForm({
        defaultValues: {
            email: undefined,
            subject: undefined,
            message: "",
        } as ContactFormData,
        onSubmit: async ({ value }) => {
            setSubmitError(null);
            try {
                const submitData = {
                    email: value.email || undefined,
                    subject:
                        value.subject === "other"
                            ? customSubject
                            : value.subject || undefined,
                    message: value.message,
                };

                await sendEmail({ data: submitData });

                setIsSubmitted(true);
                form.reset();
                setCustomSubject("");
            } catch (error) {
                console.error("Failed to send message:", error);
                setSubmitError("Failed to send message. Please try again later.");
            }
        },
        validators: {
            onChange: ({ value }) => {
                try {
                    const valueToValidate = {
                        ...value,
                        email: value.email || undefined,
                        subject: value.subject || undefined,
                    };
                    v.parse(contactFormSchema, valueToValidate);
                    return undefined;
                } catch (error) {
                    if (v.isValiError(error)) {
                        return error.issues
                            .map((issue) => issue.message)
                            .join(", ");
                    }
                    return "Validation error";
                }
            },
        },
    });

    return (
        <div className="container mx-auto px-5 lg:px-14 py-8 max-w-2xl">
            <div className="space-y-6">
                <div className="text-center space-y-3 pb-6">
                    {isSubmitted ? (
                        <>
                            <div className="flex items-center justify-center mb-4">
                                <Check className="h-12 w-12 text-green-500" />
                            </div>
                            <h1 className="text-3xl font-poppins-bold text-foreground">
                                Message Sent
                            </h1>
                            <p className="text-muted-foreground font-poppins">
                                Thank you!
                            </p>
                            <Button
                                onClick={() => navigate({ to: "/" })}
                                style={{ backgroundColor: "var(--background)" }}
                                className={cn(
                                    "mt-6 inline-flex items-center justify-center rounded-md",
                                    "font-bold text-sm h-8.5 px-4 border border-solid",
                                    "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                    "text-muted-foreground hover:text-foreground",
                                    "transition-colors duration-200 cursor-pointer",
                                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                )}
                            >
                                Back to Home
                            </Button>
                        </>
                    ) : (
                        <>
                            <h1 className="text-3xl font-poppins-bold text-foreground">
                                Contact Us
                            </h1>
                            <p className="text-muted-foreground font-poppins">
                                We'd love to hear from you. Send us a message
                                and we'll respond as soon as possible.
                            </p>
                        </>
                    )}
                </div>

                {!isSubmitted && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            form.handleSubmit();
                        }}
                        className="space-y-5"
                    >
                        <form.Field
                            name="email"
                            validators={{
                                onChange: ({ value, fieldApi }) => {
                                    if (!fieldApi.state.meta.isTouched) {
                                        return undefined;
                                    }
                                    if (value && value.trim()) {
                                        try {
                                            v.parse(emailFieldSchema, value);
                                            return undefined;
                                        } catch (error) {
                                            if (v.isValiError(error)) {
                                                return (
                                                    error.issues[0]?.message ||
                                                    "Invalid email address"
                                                );
                                            }
                                            return "Invalid email address";
                                        }
                                    }
                                    return undefined;
                                },
                                onBlur: ({ value }) => {
                                    if (value && value.trim()) {
                                        try {
                                            v.parse(emailFieldSchema, value);
                                            return undefined;
                                        } catch (error) {
                                            if (v.isValiError(error)) {
                                                return (
                                                    error.issues[0]?.message ||
                                                    "Invalid email address"
                                                );
                                            }
                                            return "Invalid email address";
                                        }
                                    }
                                    return undefined;
                                },
                            }}
                        >
                            {(field) => (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label
                                            htmlFor={field.name}
                                            className="text-sm font-medium text-foreground font-poppins"
                                        >
                                            Email
                                        </label>
                                        {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                                            <span
                                                className="text-sm text-red-500"
                                                style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 500 }}
                                            >
                                                {field.state.meta.errors[0]}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        id={field.name}
                                        type="email"
                                        value={field.state.value || ""}
                                        onChange={(e) =>
                                            field.handleChange(e.target.value)
                                        }
                                        onBlur={field.handleBlur}
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
                                        placeholder="your.email@example.com"
                                        suppressHydrationWarning
                                    />
                                </div>
                            )}
                        </form.Field>

                        <form.Field name="subject">
                            {(field) => (
                                <div className="space-y-2">
                                    <label
                                        htmlFor={field.name}
                                        className="text-sm font-medium text-foreground font-poppins"
                                    >
                                        Subject
                                    </label>
                                    <Popover
                                        open={subjectOpen}
                                        onOpenChange={(open) => {
                                            if (open && field.state.value === "other") {
                                                return;
                                            }
                                            setSubjectOpen(open);
                                        }}
                                        modal={true}
                                    >
                                        <PopoverTrigger asChild>
                                            <div className="relative">
                                                <input
                                                    ref={subjectInputRef}
                                                    type="text"
                                                    readOnly={
                                                        field.state.value !==
                                                        "other"
                                                    }
                                                    value={
                                                        field.state.value ===
                                                        "other"
                                                            ? customSubject
                                                            : field.state.value
                                                              ? SUBJECT_OPTIONS.find(
                                                                    (option) =>
                                                                        option.value ===
                                                                        field
                                                                            .state
                                                                            .value,
                                                                )?.label || ""
                                                              : ""
                                                    }
                                                    onChange={(e) => {
                                                        if (
                                                            field.state
                                                                .value ===
                                                            "other"
                                                        ) {
                                                            setCustomSubject(
                                                                e.target.value,
                                                            );
                                                        }
                                                    }}
                                                    onClick={() => {
                                                        if (
                                                            field.state
                                                                .value !==
                                                            "other"
                                                        ) {
                                                            setSubjectOpen(
                                                                true,
                                                            );
                                                        }
                                                    }}
                                                    placeholder={
                                                        field.state.value ===
                                                        "other"
                                                            ? "Enter your subject"
                                                            : "Select a subject"
                                                    }
                                                    className={cn(
                                                        "disable-animation-on-theme-change",
                                                        "w-full h-10 px-3 pr-10 text-sm font-poppins",
                                                        "border border-solid rounded-md",
                                                        "placeholder:text-muted-foreground",
                                                        "transition-colors duration-200",
                                                        subjectOpen
                                                            ? "border-muted-foreground/70 bg-background/60 text-foreground"
                                                            : "bg-background border-input text-muted-foreground",
                                                        !subjectOpen &&
                                                            "hover:border-muted-foreground/50 hover:bg-background/60 hover:text-foreground",
                                                        field.state.value === "other" &&
                                                            "text-foreground",
                                                        "focus:border-muted-foreground/70 focus:text-foreground focus:bg-background/60",
                                                        "outline-none",
                                                        field.state.value !==
                                                            "other" &&
                                                            "cursor-pointer",
                                                    )}
                                                    suppressHydrationWarning
                                                />
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSubjectOpen(
                                                            !subjectOpen,
                                                        );
                                                    }}
                                                    className={cn(
                                                        "cursor-pointer absolute inset-y-0 right-0 flex items-center px-3 transition-colors",
                                                        subjectOpen
                                                            ? "text-foreground"
                                                            : "text-muted-foreground",
                                                    )}
                                                >
                                                    <ChevronsUpDown
                                                        className="h-4 w-4 shrink-0"
                                                        style={{
                                                            color: "currentColor",
                                                        }}
                                                    />
                                                </button>
                                            </div>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            className={cn(
                                                "disable-animation-on-theme-change",
                                                "p-0 w-[var(--radix-popover-trigger-width)] bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md",
                                            )}
                                            sideOffset={9}
                                        >
                                            <Command
                                                className="border-0 rounded-md w-full bg-transparent [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:font-medium [&_[cmdk-item]]:text-sm"
                                                loop
                                            >
                                                <CommandList>
                                                    <CommandGroup>
                                                        {SUBJECT_OPTIONS.map(
                                                            (option) => (
                                                                <CommandItem
                                                                    key={
                                                                        option.value
                                                                    }
                                                                    value={
                                                                        option.value
                                                                    }
                                                                    onSelect={() => {
                                                                        field.handleChange(
                                                                            option.value,
                                                                        );
                                                                        if (
                                                                            option.value !==
                                                                            "other"
                                                                        ) {
                                                                            setCustomSubject(
                                                                                "",
                                                                            );
                                                                        } else {
                                                                            setTimeout(
                                                                                () => {
                                                                                    subjectInputRef.current?.focus();
                                                                                },
                                                                                0,
                                                                            );
                                                                        }
                                                                        setSubjectOpen(
                                                                            false,
                                                                        );
                                                                    }}
                                                                    className="cursor-pointer relative h-9 min-h-[2.25rem] text-muted-foreground hover:text-foreground transition-colors duration-200 hover:bg-[var(--background)] data-[selected=true]:bg-[var(--background)] data-[selected=true]:text-foreground"
                                                                >
                                                                    {
                                                                        option.label
                                                                    }
                                                                    <Check
                                                                        className={cn(
                                                                            "absolute right-3 h-4 w-4",
                                                                            field
                                                                                .state
                                                                                .value ===
                                                                                option.value
                                                                                ? "opacity-100"
                                                                                : "opacity-0",
                                                                        )}
                                                                        style={{
                                                                            color: "currentColor",
                                                                        }}
                                                                    />
                                                                </CommandItem>
                                                            ),
                                                        )}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            )}
                        </form.Field>

                        <form.Field
                            name="message"
                            validators={{
                                onChange: ({ value, fieldApi }) => {
                                    if (!fieldApi.state.meta.isTouched) {
                                        return undefined;
                                    }
                                    try {
                                        v.parse(
                                            v.pipe(
                                                v.string(),
                                                v.minLength(
                                                    1,
                                                    "Message is required",
                                                ),
                                                v.minLength(
                                                    10,
                                                    "Message must be at least 10 characters long",
                                                ),
                                            ),
                                            value,
                                        );
                                        return undefined;
                                    } catch (error) {
                                        if (v.isValiError(error)) {
                                            return (
                                                error.issues[0]?.message ||
                                                "Invalid message"
                                            );
                                        }
                                        return "Invalid message";
                                    }
                                },
                                onBlur: ({ value }) => {
                                    try {
                                        v.parse(
                                            v.pipe(
                                                v.string(),
                                                v.minLength(
                                                    1,
                                                    "Message is required",
                                                ),
                                                v.minLength(
                                                    10,
                                                    "Message must be at least 10 characters long",
                                                ),
                                            ),
                                            value,
                                        );
                                        return undefined;
                                    } catch (error) {
                                        if (v.isValiError(error)) {
                                            return (
                                                error.issues[0]?.message ||
                                                "Invalid message"
                                            );
                                        }
                                        return "Invalid message";
                                    }
                                },
                            }}
                        >
                            {(field) => (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label
                                            htmlFor={field.name}
                                            className="text-sm font-medium text-foreground font-poppins"
                                        >
                                            Message*
                                        </label>
                                        {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                                            <span
                                                className="text-sm text-red-500"
                                                style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 500 }}
                                            >
                                                {field.state.meta.errors[0]}
                                            </span>
                                        )}
                                    </div>
                                    <textarea
                                        id={field.name}
                                        value={field.state.value}
                                        onChange={(e) =>
                                            field.handleChange(e.target.value)
                                        }
                                        onBlur={field.handleBlur}
                                        rows={6}
                                        className={cn(
                                            "disable-animation-on-theme-change",
                                            "w-full px-3 py-2 text-sm font-poppins",
                                            "bg-background border border-solid border-input rounded-md",
                                            "text-foreground placeholder:text-muted-foreground",
                                            "hover:border-muted-foreground/50 hover:bg-background/60",
                                            "focus:border-muted-foreground/70 focus:bg-background/60",
                                            "outline-none",
                                            "transition-colors duration-200",
                                            "resize-none",
                                        )}
                                        placeholder="Your message (required, min. 10 characters)"
                                        suppressHydrationWarning
                                    />
                                </div>
                            )}
                        </form.Field>

                        <div className="space-y-3">
                            {submitError && (
                                <p
                                    className="text-sm text-red-500"
                                    style={{
                                        fontFamily: 'system-ui, -apple-system, sans-serif',
                                        fontWeight: 500
                                    }}
                                >
                                    {submitError}
                                </p>
                            )}
                            <form.Subscribe
                                selector={(state) => [
                                    state.canSubmit,
                                    state.isSubmitting,
                                ]}
                            >
                                {([canSubmit, isSubmitting]) => (
                                    <button
                                        type="submit"
                                        disabled={!canSubmit || isSubmitting}
                                        style={{
                                            backgroundColor: "var(--background)",
                                            fontFamily: 'system-ui, -apple-system, sans-serif'
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
                                        {isSubmitting
                                            ? "Sending..."
                                            : "Send Message"}
                                    </button>
                                )}
                            </form.Subscribe>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
