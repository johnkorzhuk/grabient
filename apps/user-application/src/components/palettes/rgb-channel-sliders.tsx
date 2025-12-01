import { ModifierSlider } from "@/components/palettes/modifier-slider";
import type {
    CosineCoeffs,
    GlobalModifiers,
} from "@repo/data-ops/gradient-gen/cosine";
import { useState, useEffect } from "react";
import { PI, DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";
import { applyGlobals } from "@repo/data-ops/gradient-gen/cosine";
import { rgbChannelConfig } from "@/constants/colors";

type GlobalModifierType = "exposure" | "contrast" | "frequency" | "phase";

interface RGBChannelSlidersProps {
    activeModifier: GlobalModifierType;
    coeffs: CosineCoeffs;
    globals: GlobalModifiers;
    onValueChange?: (
        modifierIndex: number,
        channelIndex: number,
        value: number,
    ) => void;
    onDragEnd?: () => void;
}

export function RGBChannelSliders({
    activeModifier,
    coeffs,
    globals,
    onValueChange,
    onDragEnd,
}: RGBChannelSlidersProps) {
    if (!activeModifier) return null;

    const getModifierIndex = (type: GlobalModifierType) => {
        switch (type) {
            case "exposure":
                return 0;
            case "contrast":
                return 1;
            case "frequency":
                return 2;
            case "phase":
                return 3;
            default:
                return 0;
        }
    };

    const modifierIndex = getModifierIndex(activeModifier);

    const min = -PI;
    const max = PI;

    const appliedCoeffs = applyGlobals(coeffs, globals);

    const appliedRgbValues: [number, number, number] = [
        appliedCoeffs[modifierIndex]?.[0] ?? 0,
        appliedCoeffs[modifierIndex]?.[1] ?? 0,
        appliedCoeffs[modifierIndex]?.[2] ?? 0,
    ];

    const [localValues, setLocalValues] = useState(appliedRgbValues);

    useEffect(() => {
        setLocalValues(appliedRgbValues);
    }, [coeffs, globals, activeModifier, modifierIndex]);

    const handleChannelChange = (channelIndex: number, value: number) => {
        const newValues = [...localValues] as [number, number, number];
        newValues[channelIndex] = value;
        setLocalValues(newValues);

        if (onValueChange) {
            onValueChange(modifierIndex, channelIndex, value);
        }
    };

    const calculateDefaultAppliedValue = (channelIndex: number) => {
        const rawCoeffValue = coeffs[modifierIndex]?.[channelIndex] ?? 0;
        switch (modifierIndex) {
            case 0:
                return rawCoeffValue + (DEFAULT_GLOBALS[0] ?? 0);
            case 1:
                return rawCoeffValue * (DEFAULT_GLOBALS[1] ?? 1);
            case 2:
                return rawCoeffValue * (DEFAULT_GLOBALS[2] ?? 1);
            case 3:
                return rawCoeffValue + (DEFAULT_GLOBALS[3] ?? 0);
            default:
                return rawCoeffValue;
        }
    };

    const channels = [
        {
            key: "red",
            label: rgbChannelConfig.red.label,
            color: rgbChannelConfig.red.color,
            value: localValues[0],
            defaultValue: calculateDefaultAppliedValue(0),
        },
        {
            key: "green",
            label: rgbChannelConfig.green.label,
            color: rgbChannelConfig.green.color,
            value: localValues[1],
            defaultValue: calculateDefaultAppliedValue(1),
        },
        {
            key: "blue",
            label: rgbChannelConfig.blue.label,
            color: rgbChannelConfig.blue.color,
            value: localValues[2],
            defaultValue: calculateDefaultAppliedValue(2),
        },
    ];

    return (
        <div className="flex flex-col justify-between h-full">
            {channels.map((channel, channelIndex) => (
                <div
                    key={channel.key}
                    className="flex-1 flex flex-col justify-center"
                >
                    <ModifierSlider
                        label={channel.label}
                        value={channel.value}
                        min={min}
                        max={max}
                        colorBar={channel.color}
                        onValueChange={(value) =>
                            handleChannelChange(channelIndex, value)
                        }
                        onDragEnd={onDragEnd}
                        className="h-full"
                        onTare={() => {
                            handleChannelChange(channelIndex, channel.defaultValue);
                        }}
                        defaultValue={channel.defaultValue}
                    />
                </div>
            ))}
        </div>
    );
}
