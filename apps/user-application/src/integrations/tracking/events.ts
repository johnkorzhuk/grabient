import { trackGA4Event } from "@/integrations/ga4/ga4Config";
import { getPostHogInstance, isPostHogInitialized } from "@/integrations/posthog/posthogConfig";
import type { paletteStyleValidator } from "@repo/data-ops/valibot-schema/grabient";
import type * as v from "valibot";

type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

const THROTTLE_MS = 1000;
const lastEventTimes = new Map<string, number>();

function isThrottled(eventName: string): boolean {
    const now = Date.now();
    const lastTime = lastEventTimes.get(eventName);
    if (lastTime && now - lastTime < THROTTLE_MS) {
        return true;
    }
    lastEventTimes.set(eventName, now);
    return false;
}

interface BaseEventProperties {
    route?: string;
}

interface GradientEventProperties extends BaseEventProperties {
    seed: string;
    style?: PaletteStyle;
    angle?: number;
    steps?: number;
}

interface CopyEventProperties extends GradientEventProperties {
    width?: number;
    height?: number;
    colorCount?: number;
}

interface DownloadEventProperties extends GradientEventProperties {
    width?: number;
    height?: number;
}

interface GridExportEventProperties extends BaseEventProperties {
    exportCount: number;
    width?: number;
    height?: number;
}

interface ManipulationEventProperties extends GradientEventProperties {
    previousAngle?: number;
    newAngle?: number;
    previousSteps?: number;
    newSteps?: number;
    previousStyle?: PaletteStyle;
    newStyle?: PaletteStyle;
}

interface ExportListEventProperties extends GradientEventProperties {
    newExportCount?: number;
    exportCount?: number;
}

interface NavigationEventProperties extends GradientEventProperties {
    sourceRoute?: string;
    fromPage?: number;
    toPage?: number;
    fromSort?: string;
    toSort?: string;
}

interface AuthEventProperties extends BaseEventProperties {
    method?: string;
}

interface EyedropperEventProperties extends BaseEventProperties {
    color: string;
}

function getCurrentRoute(): string {
    if (typeof window === "undefined") return "";
    return window.location.pathname;
}

function trackEvent<T extends BaseEventProperties>(eventName: string, properties?: T) {
    if (isThrottled(eventName)) {
        return;
    }

    const enrichedProperties = {
        ...properties,
        route: properties?.route || getCurrentRoute(),
    };

    trackGA4Event(eventName, enrichedProperties as Record<string, unknown>);

    try {
        if (isPostHogInitialized()) {
            const posthog = getPostHogInstance();
            if (posthog?.__loaded) {
                posthog.capture(eventName, enrichedProperties);
            }
        }
    } catch (error) {
        console.warn("PostHog tracking failed (possibly blocked):", error);
    }
}

export const analytics = {
    copy: {
        css: (props: GradientEventProperties) => {
            trackEvent("copy_css", props);
        },
        svg: (props: GradientEventProperties) => {
            trackEvent("copy_svg", props);
        },
        png: (props: CopyEventProperties) => {
            trackEvent("copy_png", props);
        },
        vectors: (props: GradientEventProperties) => {
            trackEvent("copy_vectors", props);
        },
        colors: (props: CopyEventProperties) => {
            trackEvent("copy_colors", props);
        },
        link: (props: GradientEventProperties) => {
            trackEvent("copy_link", props);
        },
    },

    download: {
        svg: (props: DownloadEventProperties) => {
            trackEvent("download_svg", props);
        },
        png: (props: DownloadEventProperties) => {
            trackEvent("download_png", props);
        },
        svgGrid: (props: GridExportEventProperties) => {
            trackEvent("download_svg_grid", props);
        },
        pngGrid: (props: GridExportEventProperties) => {
            trackEvent("download_png_grid", props);
        },
    },

    grid: {
        copyPng: (props: GridExportEventProperties) => {
            trackEvent("copy_png_grid", props);
        },
    },

    gradient: {
        save: (props: GradientEventProperties) => {
            trackEvent("save_gradient", props);
        },
        unsave: (props: GradientEventProperties) => {
            trackEvent("unsave_gradient", props);
        },
        view: (props: NavigationEventProperties) => {
            trackEvent("view_gradient", props);
        },
    },

    manipulation: {
        changeAngle: (props: ManipulationEventProperties) => {
            trackEvent("change_angle", props);
        },
        changeSteps: (props: ManipulationEventProperties) => {
            trackEvent("change_steps", props);
        },
        changeStyle: (props: ManipulationEventProperties) => {
            trackEvent("change_style", props);
        },
    },

    exportList: {
        add: (props: ExportListEventProperties) => {
            trackEvent("add_to_export", props);
        },
        clear: (props: Pick<ExportListEventProperties, "exportCount" | "route">) => {
            trackEvent("clear_export_list", props);
        },
    },

    navigation: {
        paginate: (props: NavigationEventProperties) => {
            trackEvent("paginate", props);
        },
        changeSort: (props: NavigationEventProperties) => {
            trackEvent("change_sort", props);
        },
    },

    auth: {
        login: (props: AuthEventProperties) => {
            trackEvent("login", props);
        },
        logout: (props: AuthEventProperties) => {
            trackEvent("logout", props);
        },
        signup: (props: AuthEventProperties) => {
            trackEvent("signup", props);
        },
    },

    engagement: {
        contactFormSubmit: (props: BaseEventProperties) => {
            trackEvent("contact_form_submit", props);
        },
    },

    eyedropper: {
        selectColor: (props: EyedropperEventProperties) => {
            trackEvent("eyedropper_select_color", props);
        },
    },
};
