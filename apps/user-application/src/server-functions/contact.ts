import { createServerFn } from "@tanstack/react-start";
import { Resend } from "resend";
import * as v from "valibot";
import { contactFormSchema } from "@repo/data-ops/valibot-schema/contact";
import { rateLimitFunctionMiddleware } from "@/core/middleware/rate-limit-function";

const TURNSTILE_VERIFY_URL =
    "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const contactFormWithTurnstileSchema = v.object({
    ...contactFormSchema.entries,
    turnstileToken: v.pipe(
        v.string(),
        v.minLength(1, "Turnstile verification required"),
    ),
});

async function verifyTurnstileToken(
    token: string,
    secretKey: string,
): Promise<boolean> {
    const formData = new FormData();
    formData.append("secret", secretKey);
    formData.append("response", token);

    try {
        const response = await fetch(TURNSTILE_VERIFY_URL, {
            method: "POST",
            body: formData,
        });
        const result = (await response.json()) as { success: boolean };
        return result.success === true;
    } catch (error) {
        console.error("Turnstile verification error:", error);
        return false;
    }
}

export const sendContactEmail = createServerFn({ method: "POST" })
    .middleware([rateLimitFunctionMiddleware("contactForm")])
    .inputValidator((input) => v.parse(contactFormWithTurnstileSchema, input))
    .handler(async (ctx) => {
        const { email, subject, message, turnstileToken } = ctx.data;

        const env = process.env;

        if (!env.TURNSTILE_SECRET_KEY) {
            console.error("TURNSTILE_SECRET_KEY is not configured");
            throw new Error("Server configuration error");
        }

        const isValidToken = await verifyTurnstileToken(
            turnstileToken,
            env.TURNSTILE_SECRET_KEY,
        );

        if (!isValidToken) {
            throw new Error("Turnstile verification failed");
        }

        if (!env.RESEND_API_KEY) {
            throw new Error("RESEND_API_KEY is not configured");
        }

        const resend = new Resend(env.RESEND_API_KEY);

        const getSubjectLine = () => {
            if (subject) {
                return `Grabient Contact: ${subject}`;
            }
            return "Grabient Contact Form Message";
        };

        const emailSubject = getSubjectLine();

        const emailContent = `
            <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333; margin-bottom: 24px;">New Contact Form Submission</h2>

                ${email ? `<p><strong>From:</strong> ${email}</p>` : '<p><strong>From:</strong> Anonymous</p>'}

                <p style="margin-top: 16px;"><strong>Message:</strong></p>
                <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0; white-space: pre-wrap;">
${message}
                </div>

                <hr style="margin: 24px 0; border: none; border-top: 1px solid #e0e0e0;">
                <p style="color: #666; font-size: 14px; margin: 0;">
                    This email was sent from the Grabient contact form.
                </p>
            </div>
        `;

        try {
            const result = await resend.emails.send({
                from: env.EMAIL_FROM || "Contact Form <noreply@grabient.com>",
                to: ["john@grabient.com"],
                subject: emailSubject,
                html: emailContent,
                ...(email && { replyTo: [email] }),
            });

            if (result.error) {
                console.error("Failed to send email:", result.error);
                throw new Error("Failed to send email");
            }

            return { success: true };
        } catch (error) {
            console.error("Failed to send email:", error);
            throw new Error("Failed to send email");
        }
    });
