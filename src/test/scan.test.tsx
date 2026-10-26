import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const m = vi.hoisted(() => ({
  dish: vi.fn(),
  kitchen: vi.fn(),
  photo: vi.fn(),
  saveDish: vi.fn(),
  saveItems: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
  user: { id: "alice" } as { id: string } | null,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({ mode: "dish" }) }),
  useNavigate: () => m.navigate,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: m.user, loading: false }) }));
vi.mock("@/lib/ai.functions", () => ({ scanDish: m.dish, scanKitchen: m.kitchen }));
vi.mock("@/lib/scan-photo", () => ({ prepareScanPhoto: m.photo }));
vi.mock("@/lib/scan-save", () => ({
  saveScannedDish: m.saveDish,
  saveScannedIngredients: m.saveItems,
}));
import { Route } from "@/routes/scan";
const Page = Route.options.component as ComponentType;
const dish = {
  is_food: true,
  name: "Tomato pasta",
  confidence: 0.9,
  ingredients: ["tomatoes"],
  calories: 350,
};
const file = new File(["photo"], "food.jpg", { type: "image/jpeg" });
function upload() {
  fireEvent.change(screen.getByLabelText("Choose a food photo"), { target: { files: [file] } });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.user = { id: "alice" };
  m.photo.mockResolvedValue("data:image/jpeg;base64,AQID");
  m.dish.mockResolvedValue(dish);
  m.kitchen.mockResolvedValue([{ name: "tomato" }]);
  m.saveDish.mockResolvedValue(undefined);
  m.saveItems.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("food scanner", () => {
  it("keeps both camera and gallery available after a failed scan and accepts the same photo again", async () => {
    m.dish.mockRejectedValueOnce(new Error("Vision service unavailable"));
    render(<Page />);
    upload();
    expect(await screen.findByRole("alert")).toHaveTextContent("Vision service unavailable");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeEnabled();
    upload();
    expect(await screen.findByRole("heading", { name: dish.name })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(m.dish).toHaveBeenCalledTimes(2);
  });

  it("recovers from empty ingredient and non-food results", async () => {
    m.kitchen.mockResolvedValueOnce([]);
    m.dish.mockResolvedValueOnce({ ...dish, is_food: false });
    render(<Page />);
    upload();
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose photo" })).toBeEnabled());
    expect(screen.queryByRole("heading", { name: dish.name })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log ingredients" }));
    upload();
    expect(await screen.findByText(/No ingredients found/)).toBeInTheDocument();
    upload();
    await screen.findByText("Found 1 ingredients");
    fireEvent.click(screen.getByRole("button", { name: "Add all to pantry" }));
    await waitFor(() => expect(m.saveItems).toHaveBeenCalledWith("alice", [{ name: "tomato" }]));
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["pantry"] });
  });

  it("blocks mode changes and duplicate scans while a scan is pending", async () => {
    let finish!: (result: typeof dish) => void;
    m.dish.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<Page />);
    upload();
    await waitFor(() => expect(m.dish).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Log ingredients" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeDisabled();
    upload();
    expect(m.dish).toHaveBeenCalledOnce();
    await act(async () => finish(dish));
    expect(await screen.findByRole("heading", { name: dish.name })).toBeInTheDocument();
  });

  it("ignores a previous account's pending scan", async () => {
    let finish!: (result: typeof dish) => void;
    m.dish.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<Page />);
    upload();
    await waitFor(() => expect(m.dish).toHaveBeenCalledOnce());
    m.user = { id: "bob" };
    view.rerender(<Page />);
    await act(async () => finish(dish));
    expect(screen.queryByRole("heading", { name: dish.name })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeEnabled();
  });

  it("retains a failed save for retry and prevents duplicate submissions", async () => {
    m.saveDish.mockRejectedValueOnce(new Error("offline"));
    render(<Page />);
    upload();
    await screen.findByRole("heading", { name: dish.name });
    const save = screen.getByRole("button", { name: "Add to planner" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeEnabled());
    expect(m.saveDish).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: dish.name })).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["planner"] }));
    expect(m.saveDish).toHaveBeenLastCalledWith(
      "alice",
      dish,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      "Lunch",
    );
    expect(screen.queryByRole("heading", { name: dish.name })).not.toBeInTheDocument();
  });

  it("does not clear another account's scan when an old save finishes", async () => {
    let finish!: () => void;
    m.saveDish.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<Page />);
    upload();
    await screen.findByRole("heading", { name: dish.name });
    fireEvent.click(screen.getByRole("button", { name: "Add to planner" }));
    m.user = { id: "bob" };
    view.rerender(<Page />);
    await act(async () => finish());
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeEnabled();
  });

  it("rejects unreadable photos before calling the vision provider", async () => {
    m.photo.mockRejectedValueOnce(new Error("Couldn't open this photo. Try another."));
    render(<Page />);
    upload();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't open this photo");
    expect(m.dish).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeEnabled();
  });
});
