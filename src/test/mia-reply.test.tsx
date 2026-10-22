import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MiaReply } from "@/components/mia-reply";

it("renders clean paragraphs and unmarked lists while preserving cooking quantities", () => {
  const { container } = render(
    <MiaReply>
      {
        "## Dinner\n\nTry **stir-fry** — it is quick.\n\n- Cook for 10–15 minutes.\n- Use 1-2 tsp oil.\n\n---"
      }
    </MiaReply>,
  );
  expect(screen.getByText("stir-fry").tagName).toBe("STRONG");
  expect(container.textContent).toContain("stir-fry, it is quick.");
  expect(container.textContent).toContain("10–15 minutes");
  expect(container.textContent).toContain("1-2 tsp");
  expect(container.querySelector("ul")).toHaveClass("list-none");
  expect(container.querySelector("hr")).toBeNull();
  expect(container.textContent).not.toContain("**");
});

it("does not load generated images or inject raw HTML", () => {
  const { container } = render(
    <MiaReply>{"![tracking](https://example.test/pixel)\n\n<script>alert(1)</script>"}</MiaReply>,
  );
  expect(container.querySelector("img,script")).toBeNull();
});
