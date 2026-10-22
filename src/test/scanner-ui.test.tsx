import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealMateScanner } from "@/components/mealmate-scanner";
import { ScannerResults } from "@/components/scanner-results";
import { initialScanProgress, type ScanEvent, type ScanResult } from "@/lib/scanner";
import { scanPhoto, scanResult } from "./scanner-fixtures";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  prepare: vi.fn(),
  save: vi.fn(),
  navigate: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/lib/scanner-client", async (original) => ({
  ...(await original<typeof import("@/lib/scanner-client")>()),
  requestScan: mocks.request,
}));
vi.mock("@/lib/scanner-camera", async (original) => ({
  ...(await original<typeof import("@/lib/scanner-camera")>()),
  prepareScanFile: mocks.prepare,
  createProductDetector: async () => null,
}));
vi.mock("@/lib/scanner-save", () => ({ saveScanResult: mocks.save }));
vi.mock("@/hooks/use-scanner-camera", () => ({
  useScannerCamera: () => ({
    videoRef: createRef(),
    state: "idle",
    error: null,
    torchAvailable: false,
    torch: false,
    start: vi.fn(),
    stop: mocks.stop,
    toggleTorch: vi.fn(),
  }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.prepare.mockResolvedValue(scanPhoto);
  mocks.save.mockResolvedValue(undefined);
});
afterEach(cleanup);
function mount(ui = <MealMateScanner onCancel={vi.fn()} />) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}
function choosePhoto() {
  fireEvent.change(screen.getByLabelText("Choose scan photo"), {
    target: { files: [new File(["synthetic"], "scan.png", { type: "image/png" })] },
  });
}
describe("scanner interface", () => {
  it("keeps progress tied to incoming events and shows attention without fabricated success", async () => {
    let emit!: (event: ScanEvent) => void;
    let finish!: (value: ScanResult) => void;
    mocks.request.mockImplementation((_input, callback) => {
      emit = callback;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    mount();
    choosePhoto();
    await waitFor(() => expect(mocks.request).toHaveBeenCalled());
    expect(screen.getAllByText("Waiting", { selector: "span" }).length).toBe(5);
    act(() =>
      emit({ type: "step", id: "identifying", status: "active", message: "Provider is reading" }),
    );
    expect(document.querySelector('[data-scan-step="identifying"]')).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(document.querySelector('[data-scan-step="verifying"]')).toHaveAttribute(
      "data-state",
      "waiting",
    );
    expect(screen.getByRole("button", { name: "Recipe" })).toBeDisabled();
    act(() =>
      emit({ type: "step", id: "ingredients", status: "attention", message: "Allergens unknown" }),
    );
    expect(screen.getByText("Allergens unknown")).toBeInTheDocument();
    await act(async () => finish(scanResult()));
    expect(screen.getByRole("heading", { name: "Test tomato bowl" })).toBeInTheDocument();
    expect(screen.getByText(/AI recognition · not independently verified/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
  it("retains the photo and retries the same input after an error", async () => {
    mocks.request
      .mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValueOnce(scanResult());
    mount();
    choosePhoto();
    await screen.findAllByText("Service unavailable");
    expect(screen.getByAltText("Your captured scan")).toHaveAttribute("src", scanPhoto);
    fireEvent.click(screen.getByRole("button", { name: "Retry analysis" }));
    await screen.findByRole("heading", { name: "Test tomato bowl" });
    expect(mocks.request.mock.calls[0][0]).toEqual(mocks.request.mock.calls[1][0]);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });
  it("ignores a late result after cancel and keeps the capture", async () => {
    let finish!: (value: ScanResult) => void;
    let signal!: AbortSignal;
    mocks.request.mockImplementation((_input, _callback, value) => {
      signal = value;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    mount();
    choosePhoto();
    await waitFor(() => expect(mocks.request).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(scanResult()));
    expect(screen.queryByRole("heading", { name: "Test tomato bowl" })).not.toBeInTheDocument();
    expect(screen.getByAltText("Your captured scan")).toHaveAttribute("src", scanPhoto);
  });
  it("supports manual product lookup without external navigation", async () => {
    mocks.request.mockResolvedValue({
      ...scanResult(),
      mode: "barcode",
      source: "open_food_facts",
      barcode: "3017620422003",
    });
    const cancel = vi.fn();
    mount(<MealMateScanner initialMode="barcode" onCancel={cancel} />);
    expect(screen.getByText(/Live barcode detection is not supported/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Enter product code"), {
      target: { value: "3017620422003" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up product" }));
    await screen.findByText("Open Food Facts · database record");
    expect(mocks.request).toHaveBeenCalledWith(
      { kind: "barcode", code: "3017620422003" },
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalled();
  });
  it("reports save failures and offers an internal destination after successful retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Save failed")).mockResolvedValueOnce(undefined);
    mount(
      <ScannerResults result={scanResult()} progress={initialScanProgress()} onReset={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to meal plan" }));
    await screen.findByText("Save failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await screen.findByText("Saved");
    fireEvent.click(screen.getByRole("button", { name: "Open planner" }));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/planner" });
    expect(mocks.save.mock.calls[0][1].logNutrition).toBe(false);
  });
});
