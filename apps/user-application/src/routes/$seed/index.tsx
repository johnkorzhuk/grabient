import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import { generateHexColors } from "@/lib/paletteUtils";
import { generateCssGradient } from "@repo/data-ops/gradient-gen";
import {
    DEFAULT_ANGLE,
    DEFAULT_STEPS,
    DEFAULT_STYLE,
} from "@repo/data-ops/valibot-schema/grabient";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";

export const Route = createFileRoute("/$seed/")({
    component: RouteComponent,
});

function RouteComponent() {
    const { seed } = useParams({ from: "/$seed/" });
    const { style: urlStyle, angle: urlAngle, steps: urlSteps } = useSearch({ from: "/$seed" });

    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);

    const { coeffs, globals } = deserializeCoeffs(seed);

    const effectiveStyle = previewStyle ?? (urlStyle === "auto" ? DEFAULT_STYLE : urlStyle);
    const effectiveAngle = previewAngle ?? (urlAngle === "auto" ? DEFAULT_ANGLE : urlAngle);
    const effectiveSteps = previewSteps ?? (urlSteps === "auto" ? DEFAULT_STEPS : urlSteps);

    const hexColors = generateHexColors(coeffs, globals, effectiveSteps);

    const buildQueryString = () => {
        const params = new URLSearchParams();
        if (effectiveStyle !== DEFAULT_STYLE) params.set("style", effectiveStyle);
        if (effectiveAngle !== DEFAULT_ANGLE) params.set("angle", effectiveAngle.toString());
        if (effectiveSteps !== DEFAULT_STEPS) params.set("steps", effectiveSteps.toString());
        const queryString = params.toString();
        return queryString ? `?${queryString}` : "";
    };

    const creditSearchString = buildQueryString();
    const { gradientString } = generateCssGradient(
        hexColors,
        effectiveStyle,
        effectiveAngle,
        { seed, searchString: creditSearchString },
    );

    return (
        <div
            className="w-full h-full lg:rounded-lg overflow-hidden"
            style={{
                backgroundImage: gradientString,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
            }}
        />
    );
}
