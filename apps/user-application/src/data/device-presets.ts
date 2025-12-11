export interface DevicePreset {
  name: string;
  resolution: [number, number];
}

export interface DevicePresets {
  mobile: DevicePreset[];
  tablet: DevicePreset[];
  desktop: DevicePreset[];
  social: DevicePreset[];
  presentation: DevicePreset[];
}

export const devicePresets: DevicePresets = {
  mobile: [
    { name: "iPhone 16 Pro Max", resolution: [1320, 2868] },
    { name: "iPhone 16 Pro", resolution: [1206, 2622] },
    { name: "iPhone 16 Plus", resolution: [1290, 2796] },
    { name: "iPhone 16", resolution: [1179, 2556] },
    { name: "iPhone SE", resolution: [750, 1334] },
    { name: "Galaxy S24 Ultra", resolution: [1440, 3120] },
    { name: "Galaxy S24", resolution: [1080, 2340] },
  ],
  tablet: [
    { name: "iPad Pro 13\"", resolution: [2064, 2752] },
    { name: "iPad Pro 11\"", resolution: [1668, 2420] },
    { name: "iPad Air 13\"", resolution: [2048, 2732] },
    { name: "iPad 11\"", resolution: [1640, 2360] },
    { name: "Galaxy Tab S9 Ultra", resolution: [1848, 2960] },
    { name: "Galaxy Tab S9", resolution: [1600, 2560] },
  ],
  desktop: [
    { name: "MacBook Air 13\"", resolution: [2560, 1664] },
    { name: "MacBook Pro 14\"", resolution: [3024, 1964] },
    { name: "MacBook Pro 16\"", resolution: [3456, 2234] },
    { name: "1080p", resolution: [1920, 1080] },
    { name: "1440p", resolution: [2560, 1440] },
    { name: "4K", resolution: [3840, 2160] },
  ],
  social: [
    { name: "Profile picture", resolution: [400, 400] },
    { name: "X/Twitter post", resolution: [1200, 675] },
    { name: "X/Twitter header", resolution: [1500, 500] },
    { name: "Instagram post", resolution: [1080, 1080] },
    { name: "Instagram story/reel", resolution: [1080, 1920] },
    { name: "Facebook cover", resolution: [820, 312] },
    { name: "Facebook post", resolution: [1200, 630] },
    { name: "TikTok post", resolution: [1080, 1920] },
    { name: "YouTube thumbnail", resolution: [1280, 720] },
    { name: "YouTube banner", resolution: [2560, 1440] },
    { name: "Dribbble shot", resolution: [2800, 2100] },
    { name: "LinkedIn cover", resolution: [1584, 396] },
    { name: "LinkedIn post", resolution: [1200, 627] },
  ],
  presentation: [
    { name: "Slide 16:9", resolution: [1920, 1080] },
    { name: "Slide 4:3", resolution: [1024, 768] },
  ],
};

export type DeviceCategory = keyof DevicePresets;

export const deviceCategoryLabels: Record<DeviceCategory, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
  social: "Social Media",
  presentation: "Presentation",
};
