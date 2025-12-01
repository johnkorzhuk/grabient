import { generateSvgGradient } from "@repo/data-ops/gradient-gen";

type PaletteStyle =
    | "linearGradient"
    | "linearSwatches"
    | "angularGradient"
    | "angularSwatches";

export interface PNGGenerationOptions {
    style: PaletteStyle;
    hexColors: string[];
    angle: number;
    seed: string;
    steps: number;
    width?: number;
    height?: number;
    quality?: number;
}

export async function generatePNGBlob(
    options: PNGGenerationOptions,
): Promise<Blob> {
    const {
        style = "linearGradient",
        hexColors,
        angle = 90,
        seed,
        steps: _steps,
        width = 800,
        height = 400,
        quality = 1,
    } = options;

    return new Promise((resolve, reject) => {
        let canvas: HTMLCanvasElement | null = null;
        let img: HTMLImageElement | null = null;

        try {
            canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            if (style === "angularGradient") {
                try {
                    const centerX = width / 2;
                    const centerY = height / 2;
                    const angleRad = ((angle - 90) * Math.PI) / 180;

                    const gradient = ctx.createConicGradient(
                        angleRad,
                        centerX,
                        centerY,
                    );

                    hexColors.forEach((color, index) => {
                        const position = index / (hexColors.length - 1);
                        gradient.addColorStop(position, color);
                    });

                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, 0, width, height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(
                                    new Error("Failed to generate PNG blob"),
                                );
                            }
                            if (canvas) {
                                canvas.width = 0;
                                canvas.height = 0;
                                canvas = null;
                            }
                        },
                        "image/png",
                        quality,
                    );
                } catch (error) {
                    reject(
                        new Error(
                            `Failed to generate conic gradient: ${error}`,
                        ),
                    );
                }
                return;
            }

            const svgString = generateSvgGradient(
                hexColors,
                style,
                angle,
                { seed, searchString: "" },
                null,
                { width, height },
            );

            img = new Image();

            img.onload = () => {
                try {
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(img!, 0, 0, width, height);

                    canvas!.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob);
                                if (canvas) {
                                    canvas.width = 0;
                                    canvas.height = 0;
                                    canvas = null;
                                }
                                if (img) {
                                    img.src = "";
                                    img = null;
                                }
                            } else {
                                reject(
                                    new Error("Failed to generate PNG blob"),
                                );
                            }
                        },
                        "image/png",
                        quality,
                    );
                } catch (error) {
                    reject(new Error(`Failed to draw SVG to canvas: ${error}`));
                }
            };

            img.onerror = () => {
                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                    canvas = null;
                }
                if (img) {
                    img.src = "";
                    img = null;
                }
                reject(new Error("Failed to load SVG image"));
            };

            const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
            img.src = svgDataUrl;
        } catch (error) {
            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
                canvas = null;
            }
            if (img) {
                img.src = "";
                img = null;
            }
            reject(new Error(`Failed to generate gradient: ${error}`));
        }
    });
}

export async function copyPNGToClipboard(
    options: PNGGenerationOptions,
): Promise<void> {
    try {
        const blob = await generatePNGBlob(options);
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
        ]);
    } catch (error) {
        throw new Error(`PNG copy to clipboard failed: ${error}`);
    }
}
