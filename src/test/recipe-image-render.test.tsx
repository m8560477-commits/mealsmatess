import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RecipeImage } from "@/components/recipe-image";

afterEach(cleanup);
describe("recipe photo lifecycle", () => {
  it("falls back from stored to the same curated dish, then to branding without a broken image", () => {
    render(
      <RecipeImage
        recipe={{
          name: "Greek chicken salad",
          image_source: "AI",
          image_url: "https://example.com/broken.png",
        }}
      />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img").getAttribute("src")).toContain("greek-chicken-salad-card.webp");
    expect(screen.getByRole("img").getAttribute("srcset")).not.toContain("example.com");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img").tagName).toBe("DIV");
    expect(screen.getByText("MealMate")).toBeInTheDocument();
  });
  it("resets failures immediately when a recycled card changes recipes", () => {
    const { rerender } = render(<RecipeImage recipe={{ name: "Unknown dish" }} />);
    rerender(<RecipeImage recipe={{ name: "Greek chicken salad" }} priority sizes="160px" />);
    const img = screen.getByRole("img");
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("sizes", "160px");
    fireEvent.load(img);
    expect(img).toHaveClass("opacity-100");
  });
  it("keeps existing photography visible during regeneration and lazily loads offscreen cards", () => {
    render(<RecipeImage recipe={{ name: "Greek chicken salad" }} generating />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
    expect(screen.queryByText("Plating your photo…")).not.toBeInTheDocument();
  });
});
