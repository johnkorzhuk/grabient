import { ModifierSlider } from "@/components/palettes/modifier-slider";
import {
    MODIFIERS,
    coeffsSchema,
    globalsSchema,
    DEFAULT_GLOBALS,
} from "@repo/data-ops/valibot-schema/grabient";
import {
    applyGlobals,
    cosineGradient,
} from "@repo/data-ops/gradient-gen/cosine";
import { rgbChannelConfig } from "@/constants/colors";
import type * as v from "valibot";
import { DevicePresets } from "@/components/palettes/device-presets";

type Coeffs = v.InferOutput<typeof coeffsSchema>;
type Globals = v.InferOutput<typeof globalsSchema>;

interface GradientModifierControlsProps {
    mod: string;
    coeffs: Coeffs;
    globals: Globals;
    onGlobalChange: (modifierIndex: number, value: number) => void;
    onRGBChannelChange: (
        modifierIndex: number,
        channelIndex: number,
        value: number,
    ) => void;
    onToggleModifier: (modifier: (typeof MODIFIERS)[number]) => void;
    onTareModifier?: (modifierIndex: number) => void;
    showDevicePresets?: boolean;
    isTouchDevice?: boolean;
}

const rgbChannels = [
    { key: "red", label: "Red", color: rgbChannelConfig.red.color },
    { key: "green", label: "Green", color: rgbChannelConfig.green.color },
    { key: "blue", label: "Blue", color: rgbChannelConfig.blue.color },
];

function getModifierRange(modifier: string) {
    switch (modifier) {
        case "exposure":
        case "phase":
            return { min: -1, max: 1 };
        default:
            return { min: 0, max: 2 };
    }
}

function getModifierIndex(modifier: string) {
    const index = MODIFIERS.findIndex((m) => m === modifier);
    if (index === -1) return -1;
    return index - 1;
}

function hasDistinctColors(colors: number[][]): boolean {
    if (colors.length <= 1) return true;

    for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
            const colorI = colors[i];
            const colorJ = colors[j];
            if (!colorI || !colorJ) continue;
            const isDifferent = colorI.some(
                (component, k) => Math.abs(component - (colorJ[k] ?? 0)) > 0.001,
            );
            if (isDifferent) return true;
        }
    }
    return false;
}

export function GradientModifierControls({
    mod,
    coeffs,
    globals,
    onGlobalChange,
    onRGBChannelChange,
    onToggleModifier,
    onTareModifier,
    showDevicePresets = false,
    isTouchDevice = false,
}: GradientModifierControlsProps) {
    if (mod !== "auto") {
        const modifierIndex = getModifierIndex(mod);
        if (modifierIndex === -1) return null;

        const modifierValue = globals[modifierIndex] ?? 0;
        const { min, max } = getModifierRange(mod);
        const appliedCoeffs = applyGlobals(coeffs, globals);

        const testColors = cosineGradient(10, appliedCoeffs);
        const shouldShowTare =
            onTareModifier !== undefined &&
            globals[modifierIndex] !== DEFAULT_GLOBALS[modifierIndex] &&
            hasDistinctColors(testColors);

        return (
            <div className="h-full flex flex-col">
                {showDevicePresets && (
                    <div className="hidden sm:flex lg:hidden items-center justify-end pb-2 shrink-0">
                        <DevicePresets showDimensions={false} />
                    </div>
                )}
                <div className="flex-1 flex flex-col justify-between">
                    <div className="flex-1 flex flex-col justify-center lg:flex-none">
                        <ModifierSlider
                            key={mod}
                            label={mod}
                            value={modifierValue}
                            min={min}
                            max={max}
                            onValueChange={(value) =>
                                onGlobalChange(modifierIndex, value)
                            }
                            onClick={() =>
                                onToggleModifier(mod as (typeof MODIFIERS)[number])
                            }
                            isActive={true}
                            showBackIcon={true}
                            className="h-full"
                            onTare={
                                shouldShowTare
                                    ? () => onTareModifier?.(modifierIndex)
                                    : undefined
                            }
                            defaultValue={DEFAULT_GLOBALS[modifierIndex]}
                            isTouchDevice={isTouchDevice}
                        />
                    </div>

                    {rgbChannels.map((channel, channelIndex) => {
                        const channelValue =
                            appliedCoeffs[modifierIndex]?.[channelIndex] ?? 0;
                        const rawCoeffValue =
                            coeffs[modifierIndex]?.[channelIndex] ?? 0;
                        const defaultAppliedValue = (() => {
                            switch (modifierIndex) {
                                case 0:
                                    return rawCoeffValue + DEFAULT_GLOBALS[0];
                                case 1:
                                    return rawCoeffValue * DEFAULT_GLOBALS[1];
                                case 2:
                                    return rawCoeffValue * DEFAULT_GLOBALS[2];
                                case 3:
                                    return rawCoeffValue + DEFAULT_GLOBALS[3];
                                default:
                                    return rawCoeffValue;
                            }
                        })();

                        return (
                            <div
                                key={channel.key}
                                className="flex-1 flex flex-col justify-center lg:flex-none"
                            >
                                <ModifierSlider
                                    label={channel.label}
                                    value={channelValue}
                                    min={-Math.PI}
                                    max={Math.PI}
                                    colorBar={channel.color}
                                    onValueChange={(value) =>
                                        onRGBChannelChange(
                                            modifierIndex,
                                            channelIndex,
                                            value,
                                        )
                                    }
                                    className="h-full"
                                    defaultValue={defaultAppliedValue}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {showDevicePresets && (
                <div className="hidden sm:flex lg:hidden items-center justify-end pb-2 shrink-0">
                    <DevicePresets showDimensions={false} />
                </div>
            )}
            <div className="flex-1 flex flex-col justify-between">
                {MODIFIERS.filter((modifier) => modifier !== "auto").map(
                    (modifier) => {
                        const modifierIndex = getModifierIndex(modifier);
                        if (modifierIndex === -1) return null;

                        const modifierValue = globals[modifierIndex] ?? 0;
                        const { min, max } = getModifierRange(modifier);

                        const appliedCoeffs = applyGlobals(coeffs, globals);
                        const testColors = cosineGradient(10, appliedCoeffs);
                        const shouldShowTare =
                            onTareModifier !== undefined &&
                            globals[modifierIndex] !==
                                DEFAULT_GLOBALS[modifierIndex] &&
                            hasDistinctColors(testColors);

                        return (
                            <div
                                key={modifier}
                                className="flex-1 flex flex-col justify-center lg:last:flex-none"
                            >
                                <ModifierSlider
                                    label={modifier}
                                    value={modifierValue}
                                    min={min}
                                    max={max}
                                    onValueChange={(value) =>
                                        onGlobalChange(modifierIndex, value)
                                    }
                                    onClick={() => onToggleModifier(modifier)}
                                    className="h-full"
                                    onTare={
                                        shouldShowTare
                                            ? () =>
                                                  onTareModifier?.(
                                                      modifierIndex,
                                                  )
                                            : undefined
                                    }
                                    defaultValue={
                                        DEFAULT_GLOBALS[modifierIndex]
                                    }
                                    isTouchDevice={isTouchDevice}
                                />
                            </div>
                        );
                    },
                )}
            </div>
        </div>
    );
}
