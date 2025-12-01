const COOKIEYES_SITE_KEY = import.meta.env.VITE_COOKIEYES_SITE_KEY;

export function getCookieYesHeadScript(): React.JSX.IntrinsicElements["script"] | null {
    if (!COOKIEYES_SITE_KEY) {
        return null;
    }

    return {
        id: "cookieyes",
        type: "text/javascript",
        src: `https://cdn-cookieyes.com/client_data/${COOKIEYES_SITE_KEY}/script.js`,
    };
}

export function isCookieYesConfigured(): boolean {
    return !!COOKIEYES_SITE_KEY;
}
