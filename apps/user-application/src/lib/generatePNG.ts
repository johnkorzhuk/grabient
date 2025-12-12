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
    borderRadius?: number;
}

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
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
        borderRadius = 0,
    } = options;

    // Convert percentage to pixels based on smaller dimension
    const minDimension = Math.min(width, height);
    const borderRadiusPx = (borderRadius / 100) * (minDimension / 2);

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

                    // Apply border radius clip if needed
                    if (borderRadiusPx > 0) {
                        drawRoundedRect(ctx, 0, 0, width, height, borderRadiusPx);
                        ctx.clip();
                    }

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

                    // Apply border radius clip if needed
                    if (borderRadiusPx > 0) {
                        drawRoundedRect(ctx, 0, 0, width, height, borderRadiusPx);
                        ctx.clip();
                    }

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
