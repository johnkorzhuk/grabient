import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";

export const Route = createFileRoute("/terms")({
    component: RouteComponent,
});

function RouteComponent() {
    return (
        <AppLayout showNavigation={false}>
            <TermsOfService />
        </AppLayout>
    );
}

function TermsOfService() {
    const lastUpdated = "November 30, 2025";

    return (
        <div className="container mx-auto px-5 lg:px-14 py-8 max-w-4xl">
            <div className="space-y-8">
                <div className="space-y-3">
                    <h1 className="text-3xl font-poppins-bold text-foreground">
                        Terms of Service
                    </h1>
                    <p className="text-muted-foreground font-poppins">
                        Last updated: {lastUpdated}
                    </p>
                </div>

                <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 font-poppins text-foreground">
                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            1. Agreement to Terms
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Welcome to Grabient. These Terms of Service
                            ("Terms") govern your access to and use of the
                            Grabient website at grabient.com (the "Service")
                            operated by Grabient ("we," "us," or "our").
                        </p>
                        <p className="text-muted-foreground leading-relaxed">
                            By accessing or using our Service, you agree to be
                            bound by these Terms. If you disagree with any part
                            of these Terms, you may not access the Service.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            2. Description of Service
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Grabient is a web-based CSS gradient generator and
                            palette management tool. Our Service allows you to:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Generate color gradients using the{" "}
                                <a
                                    href="https://iquilezles.org/articles/palettes/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground underline hover:text-muted-foreground"
                                >
                                    cosine gradient technique
                                </a>{" "}
                                by Inigo Quilez
                            </li>
                            <li>
                                Create, save, and manage gradient palettes
                            </li>
                            <li>
                                Export gradients in various formats (CSS, SVG,
                                PNG)
                            </li>
                            <li>
                                Browse and like gradients created by other users
                            </li>
                            <li>
                                Customize gradient parameters (style, angle,
                                steps)
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            3. User Accounts
                        </h2>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            3.1 Account Creation
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Some features of our Service require you to create
                            an account. You may create an account using:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Email authentication (magic link)
                            </li>
                            <li>
                                Google OAuth sign-in
                            </li>
                        </ul>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            3.2 Account Responsibilities
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            You are responsible for maintaining the security of
                            your account and for all activities that occur under
                            your account.
                        </p>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            3.3 Account Termination
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            You may delete your account at any time through your
                            account settings. Account deletion is permanent and
                            will remove your personal data. We may also
                            terminate or suspend your account if you violate
                            these Terms.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            4. User Content
                        </h2>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            4.1 Your Content
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            When you create and save gradient palettes on our
                            Service, you retain ownership of your creative
                            choices. However, by saving palettes to our Service,
                            you grant us a non-exclusive, worldwide,
                            royalty-free license to store, display, and make
                            your public palettes available to other users of the
                            Service.
                        </p>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            4.2 Public Content
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Gradient palettes saved on Grabient are publicly
                            visible and may be viewed, liked, and used by other
                            users. You understand that your saved palettes may
                            appear in public galleries and be accessible to
                            anyone using the Service.
                        </p>

                        <h3 className="text-lg font-poppins-bold text-foreground">
                            4.3 Content Standards
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                            While gradient palettes are mathematical color
                            representations, any associated content (such as
                            usernames or profile images) must not:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Violate any applicable law or regulation
                            </li>
                            <li>
                                Infringe on intellectual property rights
                            </li>
                            <li>
                                Contain offensive, harmful, or inappropriate
                                material
                            </li>
                            <li>
                                Impersonate another person or entity
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            5. Acceptable Use
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You agree not to use the Service to:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Violate any laws, regulations, or third-party
                                rights
                            </li>
                            <li>
                                Attempt to gain unauthorized access to our
                                systems or user accounts
                            </li>
                            <li>
                                Interfere with or disrupt the Service or servers
                            </li>
                            <li>
                                Use automated systems (bots, scrapers) to access
                                the Service without permission
                            </li>
                            <li>
                                Circumvent rate limiting or security measures
                            </li>
                            <li>
                                Transmit malware, viruses, or harmful code
                            </li>
                            <li>
                                Engage in any activity that could damage,
                                disable, or impair the Service
                            </li>
                            <li>
                                Use the Service for any fraudulent or deceptive
                                purpose
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            6. Rate Limiting
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            To ensure fair usage and protect our Service, we
                            implement rate limiting on various actions. Exceeding
                            these limits may result in temporary restrictions on
                            your access. Continued abuse may result in account
                            suspension.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            7. Your Use of Gradients
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Gradients you generate or export from Grabient may
                            be used freely in your personal and commercial
                            projects. You are granted a perpetual, royalty-free
                            license to use any gradient output (CSS, SVG, PNG)
                            for any lawful purpose.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            8. Source Code
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Grabient is source-available. The source code is
                            available at{" "}
                            <a
                                href="https://github.com/johnkorzhuk/grabient"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground underline hover:text-muted-foreground"
                            >
                                github.com/johnkorzhuk/grabient
                            </a>{" "}
                            under the FSL-1.1-ALv2 license. See the repository
                            for license details.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            9. Third-Party Links and Services
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Our Service may contain links to third-party
                            websites or services (such as Google for
                            authentication). We are not responsible for the
                            content, privacy policies, or practices of any
                            third-party sites or services. Your use of
                            third-party services is governed by their respective
                            terms and policies.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            10. Disclaimer of Warranties
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE"
                            WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR
                            IMPLIED. WE DISCLAIM ALL WARRANTIES, INCLUDING BUT
                            NOT LIMITED TO:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS
                                FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT
                            </li>
                            <li>
                                WARRANTIES THAT THE SERVICE WILL BE
                                UNINTERRUPTED, ERROR-FREE, OR SECURE
                            </li>
                            <li>
                                WARRANTIES REGARDING THE ACCURACY OR RELIABILITY
                                OF ANY CONTENT
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            11. Limitation of Liability
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            TO THE MAXIMUM EXTENT PERMITTED BY LAW, GRABIENT AND
                            ITS AFFILIATES, OFFICERS, EMPLOYEES, AGENTS, AND
                            LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT,
                            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
                            DAMAGES, INCLUDING BUT NOT LIMITED TO:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                LOSS OF PROFITS, DATA, USE, OR GOODWILL
                            </li>
                            <li>
                                SERVICE INTERRUPTION OR COMPUTER DAMAGE
                            </li>
                            <li>
                                COST OF SUBSTITUTE SERVICES
                            </li>
                            <li>
                                ANY DAMAGES ARISING FROM YOUR USE OF THE SERVICE
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            12. Indemnification
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You agree to indemnify, defend, and hold harmless
                            Grabient and its affiliates, officers, directors,
                            employees, and agents from any claims, damages,
                            losses, liabilities, and expenses (including
                            reasonable attorneys' fees) arising from:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                            <li>
                                Your use of the Service
                            </li>
                            <li>
                                Your violation of these Terms
                            </li>
                            <li>
                                Your violation of any rights of another party
                            </li>
                            <li>
                                Any content you submit to the Service
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            13. Modifications to Service
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We reserve the right to modify, suspend, or
                            discontinue the Service (or any part thereof) at any
                            time, with or without notice. We shall not be liable
                            to you or any third party for any modification,
                            suspension, or discontinuation of the Service.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            14. Changes to Terms
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may revise these Terms at any time by updating
                            this page. Material changes will be indicated by
                            updating the "Last updated" date. Your continued use
                            of the Service after any changes constitutes
                            acceptance of the new Terms.
                        </p>
                        <p className="text-muted-foreground leading-relaxed">
                            We encourage you to review these Terms periodically
                            for any changes.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            15. Governing Law
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            These Terms shall be governed by and construed in
                            accordance with the laws of the jurisdiction in
                            which Grabient operates, without regard to its
                            conflict of law provisions. Any disputes arising
                            from these Terms or your use of the Service shall be
                            resolved in the courts of that jurisdiction.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            16. Severability
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            If any provision of these Terms is found to be
                            unenforceable or invalid, that provision shall be
                            limited or eliminated to the minimum extent
                            necessary, and the remaining provisions shall remain
                            in full force and effect.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            17. Entire Agreement
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            These Terms, together with our{" "}
                            <Link
                                to="/privacy"
                                className="text-foreground underline hover:text-muted-foreground"
                            >
                                Privacy Policy
                            </Link>
                            , constitute the entire agreement between you and
                            Grabient regarding your use of the Service and
                            supersede any prior agreements.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-poppins-bold text-foreground">
                            18. Contact Us
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            If you have any questions about these Terms, please{" "}
                            <Link
                                to="/contact"
                                className="text-foreground underline hover:text-muted-foreground"
                            >
                                contact us
                            </Link>
                            .
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
