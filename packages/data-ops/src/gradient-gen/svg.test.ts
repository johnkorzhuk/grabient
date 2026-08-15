import { describe, expect, it } from "vitest";
import { generateSvgGradient } from "./svg";

describe("angular gradient svg smoke", () => {
    it("renders native wedges, no foreignObject, keeps figma metadata", () => {
        const svg = generateSvgGradient(
            ["#ff0000", "#00ff00", "#0000ff"],
            "angularGradient",
            90,
            { seed: "test", searchString: "" },
            null,
            { width: 800, height: 400 },
        );
        expect(svg).not.toContain("foreignObject");
        const paths = svg.match(/<path /g) ?? [];
        expect(paths.length).toBe(74); // (3-1)*36 wedges + carrier + clip
        // Figma only reattaches data-figma-gradient-fill to <path> elements —
        // a <rect> carrier pastes as a dead black shape (verified 2026-07-30).
        expect(svg).toContain(
            '<path d="M800 0H0V400H800V0Z" data-figma-gradient-fill=',
        );
        expect(svg).toContain('<clipPath id="paint0_angular_clip_path"><path d=');
        expect(svg).not.toContain("<rect");
        // Wedges are the render for everything that is not Figma; Figma skips
        // them and rebuilds the true gradient from the carrier path.
        expect(svg).toContain('data-figma-skip-parse="true"');
        expect(svg).toContain('<clipPath id="paint0_angular_clip_path">');
        // every wedge carries an explicit fill so the root fill="none" never hides it
        expect((svg.match(/fill="#[0-9a-f]{6}"/g) ?? []).length).toBe(72);
        // CSS conic from 90deg starts pointing right: first wedge at +x
        expect(svg).toContain('M 400,200 L 849.21,200.00');
        // first stop color at the start, last stop color at the wrap
        expect(svg.indexOf('fill="#ff0000"')).toBeGreaterThan(-1);
        expect(svg.indexOf('fill="#0007f8"')).toBeGreaterThan(svg.indexOf('fill="#ff0000"'));
    });

    it("grid ids stay unique per tile", () => {
        const svg = generateSvgGradient(
            ["#ff0000", "#0000ff"],
            "angularGradient",
            45,
            { seed: "test", searchString: "" },
            null,
            { width: 300, height: 300, gridItemIndex: 3 },
        );
        expect(svg).toContain('id="paint0_angular_clip_path_3"');
        expect(svg).toContain('url(#paint0_angular_clip_path_3)');
    });

    it("activeIndex dims inactive stops via fill-opacity", () => {
        const svg = generateSvgGradient(
            ["#ff0000", "#0000ff"],
            "angularGradient",
            90,
            { seed: "test", searchString: "" },
            0,
            { width: 800, height: 400 },
        );
        expect(svg).toContain("fill-opacity=");
    });
});

describe("radial swatches svg", () => {
    const svg = generateSvgGradient(
        ["#ff0000", "#00ff00", "#0000ff"],
        "radialSwatches",
        90,
        { seed: "test", searchString: "" },
        null,
        { width: 800, height: 400 },
    );

    it("draws every ring as an annulus, not a stacked disc", () => {
        // Stacked discs paint the same picture but share their area: deleting
        // the centre swatch in a vector editor would reveal the ring beneath
        // instead of leaving a hole.
        expect(svg).not.toContain("<circle");
        expect((svg.match(/<path /g) ?? []).length).toBe(3);

        // maxRadius = hypot(800, 400) / 2 = 447.214; bands are thirds of it
        const innermost = /d="M 250\.929,200\.000 A 149\.071,149\.071[^"]*" fill="#ff0000"/;
        expect(svg).toMatch(innermost);

        // Every ring but the first carries a second subpath for its hole
        const subpathCounts = [...svg.matchAll(/<path d="([^"]*)"/g)].map(
            (m) => (m[1]!.match(/M /g) ?? []).length,
        );
        expect(subpathCounts).toEqual([1, 2, 2]);
    });

    it("winds the hole opposite to the ring so it cuts under either fill-rule", () => {
        const middle = [...svg.matchAll(/<path d="([^"]*)"/g)][1]![1]!;
        const [outer, inner] = middle.split(/(?=M )/).slice(-2);
        // sweep flag is the last flag before the endpoint of each arc
        expect(outer).toContain("0 1 1");
        expect(inner).toContain("0 1 0");
        // the hole matches the previous ring's outer edge exactly
        expect(inner).toContain("149.071,149.071");
    });

    it("keeps the frame clip so the outermost ring stays inside the canvas", () => {
        // outer radius is the half-diagonal, so it overhangs every edge
        expect(svg).toContain('<g clip-path="url(#ringBounds)">');
        expect(svg).toContain("447.214,447.214");
    });
});
