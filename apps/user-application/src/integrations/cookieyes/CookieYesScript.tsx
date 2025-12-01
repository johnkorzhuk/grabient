const COOKIEYES_SITE_KEY = import.meta.env.VITE_COOKIEYES_SITE_KEY;

export function getCookieYesHeadScript() {
    if (!COOKIEYES_SITE_KEY) {
        return null;
    }

    return {
        tag: "script",
        attrs: {
            id: "cookieyes",
            type: "text/javascript",
            src: `https://cdn-cookieyes.com/client_data/${COOKIEYES_SITE_KEY}/script.js`,
        },
    };
}

export function isCookieYesConfigured(): boolean {
    return !!COOKIEYES_SITE_KEY;
}
