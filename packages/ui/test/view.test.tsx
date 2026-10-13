import { gradientCss } from "@grabient/engine/css.ts";
import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { APPEARANCE_OPTIONS, Appearance, AppearanceMenu } from "../src/Appearance.tsx";
import { ExportPanel } from "../src/ExportPanel.tsx";
import { ExportPreview } from "../src/ExportPreview.tsx";
import { EXPORT_DEFAULTS } from "../src/exportgrid.ts";
import { SizeControl } from "../src/SizeControl.tsx";

const none = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const bg = (s: string) => gradientCss(["#ff0000", "#0000ff"], s as never, 90);

describe("how a palette is drawn, on the server", () => {
  test("the appearance button names the look and what is set, and opens a menu not drawn yet", () => {
    const html = renderToString(() => (
      <Appearance
        swatch={bg("linearGradient")}
        label="Linear"
        summary="8 steps"
        open={false}
        onToggle={none}
        menu={{
          options: APPEARANCE_OPTIONS,
          style: "linearGradient",
          steps: 8,
          angle: 90,
          stepsMin: 3,
          bg,
          onStyle: none,
          onSteps: none,
          onAngle: none,
          onReset: none,
          onClose: none
        }}
      />
    ));
    expect(html).toContain('aria-label="Appearance: Linear, 8 steps"');
    expect(html).toContain('aria-controls="appearance-menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Reset appearance"');
    expect(html).not.toContain('id="appearance-menu"');
  });

  test("the menu is six pressed or unpressed tiles, then Steps and Angle, which read Auto on a list", () => {
    const html = renderToString(() => (
      <AppearanceMenu
        options={APPEARANCE_OPTIONS}
        style="auto"
        auto
        steps="auto"
        angle="auto"
        stepsMin={3}
        bg={bg}
        onStyle={none}
        onSteps={none}
        onAngle={none}
      />
    ));
    expect(count(html, 'aria-pressed="false"')).toBe(6);
    expect(html).toContain('aria-label="Radial bands"');
    expect(html).toContain('aria-label="Steps"');
    expect(html).toContain('value="Auto"');
    /* part of its page (no onClose): no id, no Close */
    expect(html).not.toContain("appearance-menu");
    expect(html).not.toContain('aria-label="Close"');
    const radial = renderToString(() => (
      <AppearanceMenu
        options={APPEARANCE_OPTIONS}
        style="radialGradient"
        steps={7}
        angle={null}
        stepsMin={3}
        bg={bg}
        onStyle={none}
        onSteps={none}
        onAngle={none}
      />
    ));
    expect(radial).not.toContain('aria-label="Angle"');
    expect(radial).toContain('value="7"');
  });

  test("the size button says the size or Auto, and its sheet waits for a press", () => {
    const auto = renderToString(() => (
      <SizeControl value={null} auto={{ width: 1020, height: 771 }} onChange={none} />
    ));
    expect(auto).toContain('aria-label="Preview size: Auto"');
    expect(auto).not.toContain('role="dialog"');
    const set = renderToString(() => (
      <SizeControl
        value={{ width: 640, height: "auto" }}
        auto={{ width: 1280, height: 720 }}
        onChange={none}
      />
    ));
    expect(set).toContain('aria-label="Preview size: 640 × 360"');
  });
});

describe("the export column, on the server", () => {
  test("the column counts the selection, sizes each palette, lays them out and copies them", () => {
    const html = renderToString(() => (
      <ExportPanel
        count={3}
        settings={EXPORT_DEFAULTS}
        onSettings={none}
        autoSize={{ width: 1000, height: 600 }}
      />
    ));
    expect(html).toContain('aria-label="Export"');
    expect(html).toMatch(/3<\/span> selected/);
    expect(html).toContain('aria-label="Close selection"');
    for (const name of ["Width", "Height", "Columns", "Gap", "Padding", "Corners"])
      expect(html).toContain(`aria-label="${name}"`);
    expect(html).toContain('value="10%"');
    expect(html).toContain('aria-label="Copying. Switch to download"');
    expect(count(html, 'value="Auto"')).toBe(3);
  });

  test("a column with a Save side opens on Export, and Clear waits for a selection", () => {
    const html = renderToString(() => (
      <ExportPanel count={0} settings={EXPORT_DEFAULTS} onSettings={none} save={<p>save</p>} />
    ));
    expect(html).toContain('aria-label="Save or export"');
    expect(html).toMatch(/aria-checked="true"[^>]*>[^<]*<svg[\s\S]*?Export/);
    expect(html).toMatch(/disabled[^>]*>Clear</);
  });

  test("the preview draws nothing until it has a room", () => {
    const html = renderToString(() => (
      <ExportPreview
        items={[{ id: "a", stops: ["#000000", "#ffffff"], style: "linearGradient", angle: 90 }]}
        settings={EXPORT_DEFAULTS}
      />
    ));
    expect(html).not.toContain("Export preview");
  });
});
