const COOKIEYES_SITE_KEY = import.meta.env.VITE_COOKIEYES_SITE_KEY;
const IS_DEV = import.meta.env.DEV;

export function getCookieYesHeadScript(): React.JSX.IntrinsicElements["script"] | null {
    // CookieYes suspended - return null to disable
    // To re-enable: remove this early return
    return null;

    if (!COOKIEYES_SITE_KEY || IS_DEV) {
        return null;
    }

    return {
        id: "cookieyes",
        type: "text/javascript",
        src: `https://cdn-cookieyes.com/client_data/${COOKIEYES_SITE_KEY}/script.js`,
    };
}

export function isCookieYesConfigured(): boolean {
    // CookieYes suspended
    return false;
    // return !!COOKIEYES_SITE_KEY && !IS_DEV;
}
