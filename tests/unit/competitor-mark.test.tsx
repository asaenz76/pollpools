import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompetitorMark } from "@/components/domain/competitor-mark";

/** CV.3 — the shared competitor identity renderer. */
describe("CompetitorMark", () => {
  it("renders a solid swatch for one color", () => {
    render(<CompetitorMark name="Blue" colors={["#0047ab"]} />);
    const style = (screen.getByRole("img", { name: /Blue/ }).getAttribute("style") ?? "").toLowerCase();
    expect(style).toContain("rgb(0, 71, 171)"); // #0047ab (jsdom normalizes hex → rgb)
    expect(style).not.toContain("gradient");
  });

  it("renders distinct segments (not a blending gradient) for 2, 3, and 4 colors", () => {
    for (const colors of [["#ed1c24", "#ffffff"], ["#ed1c24", "#ffb000", "#ffffff"], ["#0033cc", "#ffffff", "#ff0000", "#ffd700"]]) {
      const { unmount } = render(<CompetitorMark name="Multi" colors={colors} />);
      const style = (screen.getByRole("img", { name: /Multi/ }).getAttribute("style") ?? "").toLowerCase();
      // Hard-stop conic segments: one color stop per color, each with its own range.
      expect(style).toContain("conic-gradient");
      expect((style.match(/rgb\(/g) ?? []).length).toBe(colors.length);
      expect(style).toContain("%"); // explicit stop percentages (hard edges, not a blend)
      unmount();
    }
  });

  it("shows the identifier and includes it in the accessible label", () => {
    render(<CompetitorMark name="Eight" colors={["#111111"]} identifier="8" />);
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Eight, number 8/ })).toBeInTheDocument();
  });

  it("describes colors in the accessible label (never color alone)", () => {
    render(<CompetitorMark name="Fireball" colors={["#ed1c24", "#ffb000", "#ffffff"]} />);
    expect(screen.getByRole("img", { name: /Fireball, 3 colors/ })).toBeInTheDocument();
  });

  it("renders safely with no colors, no identifier, no image", () => {
    render(<CompetitorMark name="Plain" />);
    expect(screen.getByRole("img", { name: /Plain/ })).toBeInTheDocument();
  });

  it("renders an image when provided", () => {
    render(<CompetitorMark name="Pic" imageUrl="https://example.test/a.png" />);
    const img = screen.getByRole("img", { name: /Pic/ }).querySelector("img");
    expect(img?.getAttribute("src")).toContain("a.png");
  });
});
