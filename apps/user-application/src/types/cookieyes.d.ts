/**
 * CookieYes TypeScript Definitions
 *
 * CookieYes does not provide an official SDK or @types package.
 * These types are derived from official CookieYes documentation.
 *
 * Sources:
 * - getCkyConsent(): https://www.cookieyes.com/documentation/retrieving-consent-data-using-api-getckyconsent/
 * - Banner Load Event: https://www.cookieyes.com/documentation/events-on-cookie-banner-load/
 * - Consent Update Event: https://www.cookieyes.com/documentation/events-on-cookie-banner-interactions/
 * - Banner Action API: https://www.cookieyes.com/documentation/consent-banner-action-api/
 */

declare global {
    /**
     * Cookie consent categories.
     * These are the internal category names - always use these even if
     * categories are renamed in the CookieYes dashboard UI.
     */
    interface CookieYesCategories {
        necessary: boolean;
        functional: boolean;
        analytics: boolean;
        performance: boolean;
        advertisement: boolean;
    }

    /**
     * Return type of getCkyConsent() function.
     */
    interface CookieYesConsent {
        /** Legal framework: "gdpr", "ccpa", "lgpd", etc. Empty string if no law applies. */
        activeLaw: string;
        /** User's consent status for each category */
        categories: CookieYesCategories;
        /** True if user has interacted with the consent banner */
        isUserActionCompleted: boolean;
        /** Unique identifier for this consent record */
        consentID: string;
        /** ISO-639-1 language code of the displayed banner (e.g., "en") */
        languageCode: string;
    }

    /**
     * Event detail for cookieyes_banner_load event.
     * Fired when CookieYes script loads, regardless of whether banner is shown.
     */
    interface CookieYesBannerLoadEventDetail {
        activeLaw: string;
        categories: CookieYesCategories;
        isUserActionCompleted: boolean;
        consentID: string;
        languageCode: string;
    }

    /**
     * Event detail for cookieyes_consent_update event.
     * Fired when user interacts with the banner (accept/reject/save preferences).
     */
    interface CookieYesConsentUpdateEventDetail {
        /** Category names the user accepted (e.g., ["necessary", "analytics"]) */
        accepted: string[];
        /** Category names the user rejected (e.g., ["advertisement"]) */
        rejected: string[];
    }

    interface WindowEventMap {
        cookieyes_banner_load: CustomEvent<CookieYesBannerLoadEventDetail>;
        cookieyes_consent_update: CustomEvent<CookieYesConsentUpdateEventDetail>;
    }

    /**
     * Retrieves current consent state.
     * Only available after cookieyes_banner_load event fires.
     */
    function getCkyConsent(): CookieYesConsent;

    /**
     * Programmatically trigger banner actions.
     *
     * @param action - "accept_all" | "reject" | "accept_partial"
     */
    function performBannerAction(
        action: "accept_all" | "reject" | "accept_partial",
    ): void;
}

export {};
