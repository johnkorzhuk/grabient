import { describe, expect, it } from "vitest";
import { fitCosinePalette } from "@repo/data-ops/gradient-gen/fit-linear";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/coeffs";
import { renderPalette } from "../src/palette";

/**
 * Benchmark harness for the cosine-palette fitter.
 *
 * Scoring goes through the REAL round trip a caller sees:
 *   hexes -> fitCosinePalette -> serializeCoeffs -> renderPalette(steps = hexes.length)
 * so the 3-decimal coefficient rounding in the seed encoding is included.
 * `validateFit` skips that rounding, which is why it is not used here.
 *
 * Run: cd apps/web && pnpm vitest run test/fit-bench.test.js
 * Set FIT_BENCH_BASELINE=/path/to.json to diff a previous run's per-case maxima.
 */

const hexToTriple = (hex) => {
    const clean = hex.replace("#", "");
    const full =
        clean.length === 3
            ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
            : clean;
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
};

/**
 * Fit, serialize, re-render at the input length, and score in 0-255 channel
 * units. A throw scores as `max: 255` rather than aborting the sweep - the
 * pre-fix implementation crashed on 0/1 inputs and the table has to show that.
 */
function score(hexes, fit = fitCosinePalette) {
    try {
        return scoreOrThrow(hexes, fit);
    } catch (err) {
        return { max: 255, mean: 255, seed: null, fitted: null, threw: String(err) };
    }
}

function scoreOrThrow(hexes, fit) {
    const result = fit(hexes);
    const seed = serializeCoeffs(result.coeffs, DEFAULT_GLOBALS);
    const rendered = renderPalette(seed, "linearGradient", Math.max(1, hexes.length), 90);
    if (!rendered) throw new Error("renderPalette returned null");

    let max = 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < hexes.length; i++) {
        const want = hexToTriple(hexes[i]);
        const got = hexToTriple(rendered.hexColors[i]);
        for (let ch = 0; ch < 3; ch++) {
            const err = Math.abs(want[ch] - got[ch]);
            if (err > max) max = err;
            sum += err;
            count++;
        }
    }
    return { max, mean: count ? sum / count : 0, seed, fitted: rendered.hexColors };
}

function pad(s, n) {
    const str = String(s);
    return str.length >= n ? str : str + " ".repeat(n - str.length);
}
function padStart(s, n) {
    const str = String(s);
    return str.length >= n ? str : " ".repeat(n - str.length) + str;
}

describe("cosine palette fit benchmark", () => {
    it("scores the fixed corpus and prints a table", () => {
        const rows = [];
        for (const c of CORPUS) {
            const s = score(c.hexes);
            rows.push({ name: c.name, n: c.hexes.length, max: s.max, mean: s.mean });
        }

        const lines = [];
        lines.push("");
        lines.push(`${pad("case", 28)}${padStart("n", 4)}${padStart("max", 7)}${padStart("mean", 8)}`);
        lines.push("-".repeat(47));
        const groupOf = (name) => name.split("/")[0];
        const groups = new Map();
        for (const r of rows) {
            lines.push(
                `${pad(r.name, 28)}${padStart(r.n, 4)}${padStart(r.max, 7)}${padStart(r.mean.toFixed(2), 8)}`,
            );
            const g = groupOf(r.name);
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(r);
        }
        lines.push("-".repeat(47));
        for (const [g, rs] of groups) {
            const worst = Math.max(...rs.map((r) => r.max));
            const avgMax = rs.reduce((a, r) => a + r.max, 0) / rs.length;
            const avgMean = rs.reduce((a, r) => a + r.mean, 0) / rs.length;
            lines.push(
                `${pad(`GROUP ${g} (${rs.length})`, 28)}${padStart("", 4)}${padStart(worst, 7)}${padStart(avgMean.toFixed(2), 8)}   avg-max ${avgMax.toFixed(2)}`,
            );
        }
        const worstAll = Math.max(...rows.map((r) => r.max));
        const avgMaxAll = rows.reduce((a, r) => a + r.max, 0) / rows.length;
        const avgMeanAll = rows.reduce((a, r) => a + r.mean, 0) / rows.length;
        const p90 = [...rows.map((r) => r.max)].sort((a, b) => a - b)[
            Math.floor(rows.length * 0.9)
        ];
        lines.push("-".repeat(47));
        lines.push(
            `${pad(`AGGREGATE (${rows.length})`, 28)}${padStart("", 4)}${padStart(worstAll, 7)}${padStart(avgMeanAll.toFixed(2), 8)}   avg-max ${avgMaxAll.toFixed(2)}  p90-max ${p90}`,
        );
        lines.push("");
        lines.push(
            `JSON ${JSON.stringify(Object.fromEntries(rows.map((r) => [r.name, r.max])))}`,
        );
        console.log(lines.join("\n"));

        expect(rows.length).toBe(CORPUS.length);
    });

    it("never throws on degenerate input", () => {
        expect(() => fitCosinePalette([])).not.toThrow();
        expect(() => fitCosinePalette(["#fff"])).not.toThrow();
        expect(() => fitCosinePalette(["#123456"])).not.toThrow();
    });

    it("returns a flat palette for a single colour", () => {
        const s = score(["#7a3b9c"]);
        expect(s.max).toBeLessThanOrEqual(1);
    });

    it("keeps the already-good baseline cases good (regression floor)", () => {
        // These sat at <= 7 max error before any of this work. Locking them in is
        // what stops an "aggregate win" that quietly wrecks the easy palettes.
        const easy = [
            "base/brand-duo",
            "base/near-black-3",
            "base/grayscale",
            "base/sunset-3",
        ];
        for (const name of easy) {
            const c = CORPUS.find((x) => x.name === name);
            expect(score(c.hexes).max, name).toBeLessThanOrEqual(7);
        }
    });
});

export { CORPUS, score };
