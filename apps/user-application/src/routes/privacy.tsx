import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect } from "react";

export const Route = createFileRoute("/privacy")({
    component: RouteComponent,
});

function RouteComponent() {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <AppLayout showNavigation={false}>
            <PrivacyPolicy />
        </AppLayout>
    );
}

function PrivacyPolicy() {
    const lastUpdated = "December 25, 2025";

    return (
        <div className="container mx-auto px-5 lg:px-14 pb-16 max-w-4xl">
            <div className="space-y-10">
                <div className="space-y-3">
                    <h1 className="text-3xl font-poppins-bold text-foreground">
                        Privacy Policy
                    </h1>
                    <p className="text-muted-foreground font-system">
                        Last updated: {lastUpdated}
                    </p>
                </div>

                <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 font-poppins text-foreground">
                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            1. Introduction
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Welcome to Grabient ("we," "our," or "us"). We are
                            committed to protecting your privacy and being
                            transparent about how we collect, use, and share
                            your personal information. This Privacy Policy
                            explains our practices regarding data collection
                            when you use our website at grabient.com (the
                            "Service").
                        </p>
                        <p className="text-muted-foreground leading-relaxed">
                            By using Grabient, you agree to the collection and
                            use of information in accordance with this policy.
                            If you do not agree with our practices, please do
                            not use our Service.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            2. Information We Collect
                        </h2>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            2.1 Information You Provide
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            When you create an account or use our Service, you
                            may provide:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Account Information:
                                </strong>{" "}
                                Email address, username (optional), and profile
                                avatar image (optional)
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Authentication Data:
                                </strong>{" "}
                                If you sign in with Google OAuth, we receive
                                your Google account email and profile
                                information
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    User-Generated Content:
                                </strong>{" "}
                                Gradient palettes you create and save, including
                                gradient parameters (seed, style, steps, angle)
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Contact Information:
                                </strong>{" "}
                                Email address and message content when you use
                                our contact form
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            2.2 Information Collected Automatically
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            When you access or use our Service, we automatically
                            collect:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Device and Browser Information:
                                </strong>{" "}
                                IP address, browser type and version, operating
                                system, and user agent
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Usage Data:
                                </strong>{" "}
                                Pages visited, features used, gradient actions
                                (copying, downloading, saving), and interaction
                                patterns
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Session Information:
                                </strong>{" "}
                                Session tokens, login timestamps, and session
                                expiration data
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            3. How We Use Your Information
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We use the information we collect to:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>Provide, maintain, and improve our Service</li>
                            <li>
                                Create and manage your account, including
                                authentication
                            </li>
                            <li>
                                Save and display your gradient palettes and
                                preferences
                            </li>
                            <li>
                                Respond to your inquiries and provide customer
                                support
                            </li>
                            <li>
                                Send transactional emails (magic links for
                                authentication, account deletion confirmation)
                            </li>
                            <li>
                                Analyze usage patterns to improve user
                                experience
                            </li>
                            <li>
                                Monitor and prevent fraud, abuse, and security
                                issues
                            </li>
                            <li>Comply with legal obligations</li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            4. Third-Party Services
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We use the following third-party services to operate
                            and improve our Service. These services may collect
                            information about you as described below:
                        </p>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            4.1 Analytics Services
                        </h3>
                        <ul className="list-disc pl-6 space-y-3 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    PostHog:
                                </strong>{" "}
                                We use PostHog for product analytics to
                                understand how users interact with our Service.
                                PostHog may collect usage events, page views,
                                and interaction data. With your consent, PostHog
                                may also record sessions (with sensitive data
                                masked). PostHog is GDPR-compliant and
                                participates in the EU-US Data Privacy
                                Framework. Learn more:{" "}
                                <a
                                    href="https://posthog.com/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    PostHog Privacy Policy
                                </a>
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Google Analytics 4:
                                </strong>{" "}
                                We use Google Analytics to analyze website
                                traffic and usage patterns. Google Analytics
                                collects information such as pages visited, time
                                spent on pages, and demographic data. IP
                                addresses are anonymized by default in GA4.
                                Learn more:{" "}
                                <a
                                    href="https://policies.google.com/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    Google Privacy Policy
                                </a>
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            4.2 Advertising
                        </h3>
                        <ul className="list-disc pl-6 space-y-3 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Google AdSense:
                                </strong>{" "}
                                We display ads served by Google. Google may use
                                cookies to serve ads based on your prior visits
                                to this or other websites. You can opt out of
                                personalized advertising at{" "}
                                <a
                                    href="https://adssettings.google.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    Google Ads Settings
                                </a>
                                . Learn more:{" "}
                                <a
                                    href="https://policies.google.com/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    Google Privacy Policy
                                </a>
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            4.3 Error Tracking
                        </h3>
                        <ul className="list-disc pl-6 space-y-3 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Sentry:
                                </strong>{" "}
                                We use Sentry to monitor and fix errors in our
                                Service. Sentry may collect error reports,
                                browser information, and diagnostic data. With
                                your consent, Sentry may also record sessions
                                for debugging purposes (with sensitive data
                                masked). Sentry is GDPR-compliant and certified
                                under the EU-US Data Privacy Framework. Learn
                                more:{" "}
                                <a
                                    href="https://sentry.io/privacy/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    Sentry Privacy Policy
                                </a>
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            4.4 Infrastructure Services
                        </h3>
                        <ul className="list-disc pl-6 space-y-3 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Cloudflare:
                                </strong>{" "}
                                Our Service is hosted on Cloudflare's
                                infrastructure, including Cloudflare Workers
                                (computing), D1 (database), and R2 (file
                                storage). All data is encrypted at rest and in
                                transit. Cloudflare is GDPR-compliant and offers
                                data processing agreements. Learn more:{" "}
                                <a
                                    href="https://www.cloudflare.com/trust-hub/gdpr/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    Cloudflare GDPR Compliance
                                </a>
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Resend:
                                </strong>{" "}
                                We use Resend to send transactional emails
                                (authentication links, account notifications).
                                Resend processes email addresses and message
                                content. Resend is GDPR-compliant and certified
                                under the EU-US Data Privacy Framework. Learn
                                more:{" "}
                                <a
                                    href="https://resend.com/legal/privacy-policy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    Resend Privacy Policy
                                </a>
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            4.5 Authentication Services
                        </h3>
                        <ul className="list-disc pl-6 space-y-3 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Google OAuth:
                                </strong>{" "}
                                If you choose to sign in with Google, we receive
                                basic profile information from Google (email,
                                name, profile picture). We do not receive your
                                Google password. Learn more:{" "}
                                <a
                                    href="https://policies.google.com/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    Google Privacy Policy
                                </a>
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            5. Cookies and Tracking Technologies
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We use cookies and similar technologies to operate
                            our Service and collect information:
                        </p>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            5.1 Cookie Consent Management
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            We use{" "}
                            <a
                                href="https://www.cloudflare.com/products/zaraz/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground underline hover:text-muted-foreground"
                            >
                                Cloudflare Zaraz
                            </a>{" "}
                            to manage third-party tools and cookie consent in
                            compliance with GDPR and other privacy regulations.
                            Zaraz loads third-party scripts through Cloudflare's
                            edge network, improving privacy and performance.
                            Learn more:{" "}
                            <a
                                href="https://www.cloudflare.com/trust-hub/gdpr/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground underline hover:text-muted-foreground"
                            >
                                Cloudflare GDPR Compliance
                            </a>
                        </p>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            5.2 Essential Cookies
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            These cookies are necessary for the Service to
                            function and cannot be disabled:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Session cookies:
                                </strong>{" "}
                                Used to maintain your login session (HTTP-only,
                                secure)
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Consent preferences:
                                </strong>{" "}
                                Stored in localStorage to remember your privacy
                                choices
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Theme preference:
                                </strong>{" "}
                                Stored in localStorage to remember your
                                light/dark mode setting
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            5.3 Analytics Cookies (Consent Required)
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            With your consent, we use analytics cookies from:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>PostHog (product analytics)</li>
                            <li>Google Analytics 4 (web analytics)</li>
                            <li>Sentry (error tracking)</li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            5.4 Advertising Cookies (Consent Required)
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            With your consent, we use advertising cookies from:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>Google AdSense (personalized advertising)</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed">
                            These cookies enable personalized ads based on your
                            browsing activity. You can opt out of personalized
                            advertising at any time through our cookie consent
                            banner or in your{" "}
                            <Link
                                to="/settings"
                                className="text-foreground underline hover:text-muted-foreground"
                            >
                                account settings
                            </Link>
                            .
                        </p>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            5.5 Regional Consent Behavior
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Our consent defaults vary by region based on
                            applicable privacy laws:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    EEA, UK (GDPR regions):
                                </strong>{" "}
                                All non-essential cookies and tracking are
                                disabled by default. You must explicitly opt-in
                                to enable analytics, session replay, or
                                advertising features.
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Other regions:
                                </strong>{" "}
                                Analytics and advertising are enabled by default
                                under legitimate interest. You can opt-out at
                                any time in your{" "}
                                <Link
                                    to="/settings"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    account settings
                                </Link>
                                .
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            5.6 Session Recording (Separate Consent Required)
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            With your explicit consent to Session Replay, we may
                            record your session to understand how users interact
                            with our Service and identify usability issues.
                            Session Replay is a separate consent option from
                            Analytics. Session recordings:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Are fully anonymized with all text and inputs
                                masked
                            </li>
                            <li>Block media and images from being recorded</li>
                            <li>
                                Require separate opt-in via the Session Replay
                                toggle in your settings
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            6. Your Privacy Choices
                        </h2>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            6.1 Consent Management
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            You can manage your privacy preferences at any time
                            by visiting the Privacy & Consent section in your{" "}
                            <Link
                                to="/settings"
                                className="text-foreground underline hover:text-muted-foreground"
                            >
                                account settings
                            </Link>
                            . There you can individually toggle:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Analytics:
                                </strong>{" "}
                                Anonymous usage analytics to help us improve
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Session Replay:
                                </strong>{" "}
                                Anonymized session recordings
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Marketing:
                                </strong>{" "}
                                Personalized ads and marketing content
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            6.2 Account Controls
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            If you have an account, you can:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Update your profile information in account
                                settings
                            </li>
                            <li>Delete your saved gradients</li>
                            <li>
                                Delete your account entirely (this permanently
                                removes all your data)
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            6.3 Browser Controls
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Most browsers allow you to control cookies through
                            their settings. You can also use browser extensions
                            to block tracking. Note that blocking essential
                            cookies may affect the functionality of our Service.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            7. Data Retention
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We retain your personal information for as long as
                            necessary to provide our Service and fulfill the
                            purposes described in this policy:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">
                                    Account data:
                                </strong>{" "}
                                Retained until you delete your account
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Session data:
                                </strong>{" "}
                                Sessions expire after 7 days of inactivity
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Magic link tokens:
                                </strong>{" "}
                                Expire after 5 minutes
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Account deletion tokens:
                                </strong>{" "}
                                Expire after 24 hours
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Analytics data:
                                </strong>{" "}
                                Retained according to each third-party
                                provider's retention policy
                            </li>
                            <li>
                                <strong className="text-foreground">
                                    Contact form messages:
                                </strong>{" "}
                                Retained as needed to respond to inquiries
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            8. Data Security
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We implement appropriate technical and
                            organizational measures to protect your personal
                            information:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                All data is encrypted in transit using TLS/HTTPS
                            </li>
                            <li>All data is encrypted at rest (AES-256)</li>
                            <li>Passwords are hashed using scrypt algorithm</li>
                            <li>Session cookies are HTTP-only and secure</li>
                            <li>Rate limiting protects against abuse</li>
                            <li>CSRF protection is enabled on all forms</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed">
                            While we strive to protect your information, no
                            method of transmission over the Internet is 100%
                            secure. We cannot guarantee absolute security.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            9. International Data Transfers
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Your information may be transferred to and processed
                            in countries other than your own, including the
                            United States. Our service providers maintain
                            appropriate safeguards for international data
                            transfers:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                EU-US Data Privacy Framework certification
                                (where applicable)
                            </li>
                            <li>
                                Standard Contractual Clauses (SCCs) for EU data
                            </li>
                            <li>
                                Data Processing Agreements with all
                                subprocessors
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            10. Your Rights
                        </h2>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            10.1 Rights for All Users
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Regardless of your location, you have the right to:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Access the personal information we hold about
                                you
                            </li>
                            <li>Correct inaccurate personal information</li>
                            <li>Delete your account and associated data</li>
                            <li>Withdraw consent for analytics and tracking</li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            10.2 Additional Rights for EU/EEA Residents (GDPR)
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            If you are in the European Union or European
                            Economic Area, you also have the right to:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Request restriction of processing of your
                                personal data
                            </li>
                            <li>
                                Object to processing based on legitimate
                                interests
                            </li>
                            <li>
                                Request data portability (receive your data in a
                                structured, machine-readable format)
                            </li>
                            <li>
                                Lodge a complaint with your local data
                                protection authority
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            10.3 Additional Rights for California Residents
                            (CCPA/CPRA)
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            If you are a California resident, you have the right
                            to:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Know what personal information we collect, use,
                                and disclose
                            </li>
                            <li>
                                Request deletion of your personal information
                            </li>
                            <li>
                                Opt-out of the "sale" or "sharing" of your
                                personal information
                            </li>
                            <li>
                                Non-discrimination for exercising your privacy
                                rights
                            </li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed">
                            <strong className="text-foreground">
                                We do not sell your personal information.
                            </strong>{" "}
                            We do not share your personal information for
                            cross-context behavioral advertising.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            11. Children's Privacy
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Our Service is not directed to children under 13
                            years of age (or 16 in the EU). We do not knowingly
                            collect personal information from children. If you
                            believe we have collected information from a child,
                            please contact us immediately.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            12. Changes to This Policy
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may update this Privacy Policy from time to time.
                            We will notify you of any material changes by
                            posting the new policy on this page and updating the
                            "Last updated" date. We encourage you to review this
                            policy periodically.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            13. Contact Us
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            If you have any questions about this Privacy Policy
                            or wish to exercise your privacy rights, please{" "}
                            <Link
                                to="/contact"
                                className="text-foreground underline hover:text-muted-foreground"
                            >
                                contact us
                            </Link>
                            . For data protection inquiries, please include
                            "Privacy Request" in your message subject.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
