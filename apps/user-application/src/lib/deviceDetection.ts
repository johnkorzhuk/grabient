import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export interface DeviceInfo {
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    isTouchDevice: boolean;
    isIOS: boolean;
    isAndroid: boolean;
}

function detectDeviceFromUserAgent(
    userAgent: string,
): Omit<DeviceInfo, "isTouchDevice"> {
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /android/i.test(userAgent);

    const isIPad =
        /iPad/.test(userAgent) ||
        (/Macintosh/.test(userAgent) && /Safari/.test(userAgent));

    const isIPhone = /iPhone/.test(userAgent);

    const isAndroidTablet = isAndroid && !/mobile/i.test(userAgent);
    const isAndroidPhone = isAndroid && /mobile/i.test(userAgent);

    const isMobile =
        (isIPhone || isAndroidPhone) && !isIPad && !isAndroidTablet;
    const isTablet = isIPad || isAndroidTablet;
    const isDesktop = !isMobile && !isTablet;

    return {
        isMobile,
        isTablet,
        isDesktop,
        isIOS: isIOS || isIPad,
        isAndroid,
    };
}

export const detectDevice = createIsomorphicFn()
    .server((): DeviceInfo => {
        let userAgent = "";

        try {
            const request = getRequest();
            userAgent = request.headers.get("user-agent") || "";
        } catch {
            userAgent = "";
        }

        if (!userAgent) {
            return {
                isMobile: false,
                isTablet: false,
                isDesktop: true,
                isTouchDevice: false,
                isIOS: false,
                isAndroid: false,
            };
        }

        const deviceInfo = detectDeviceFromUserAgent(userAgent);

        return {
            ...deviceInfo,
            isTouchDevice: deviceInfo.isMobile || deviceInfo.isTablet,
        };
    })
    .client((): DeviceInfo => {
        const userAgent = navigator.userAgent || navigator.vendor || "";
        const isTouchDevice =
            "ontouchstart" in window || navigator.maxTouchPoints > 0;

        const isIOS = /iPad|iPhone|iPod/.test(userAgent);
        const isAndroid = /android/i.test(userAgent);

        const isIPad =
            /iPad/.test(userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

        const isIPhone = /iPhone/.test(userAgent);

        const isAndroidTablet = isAndroid && !/mobile/i.test(userAgent);
        const isAndroidPhone = isAndroid && /mobile/i.test(userAgent);

        const isMobile =
            (isIPhone || isAndroidPhone) && !isIPad && !isAndroidTablet;
        const isTablet = isIPad || isAndroidTablet;
        const isDesktop = !isMobile && !isTablet;

        return {
            isMobile,
            isTablet,
            isDesktop,
            isTouchDevice,
            isIOS: isIOS || isIPad,
            isAndroid,
        };
    });

export function shouldDisableScrollLock(): boolean {
    const device = detectDevice();
    return device.isMobile || device.isTablet || device.isTouchDevice;
}
