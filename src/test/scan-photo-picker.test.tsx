import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanPhotoPicker } from "@/components/scan-photo-picker";

const native = vi.hoisted(() => ({ value: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.value } }));
const getUserMedia = vi.fn();
const stop = vi.fn();
const onPhoto = vi.fn();
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
}
async function ready() {
  const video = screen.getByLabelText("Food camera preview") as HTMLVideoElement;
  await waitFor(() => expect(video.srcObject).toBe(stream));
  Object.defineProperty(video, "videoWidth", { value: 1920, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: 1080, configurable: true });
  fireEvent.canPlay(video);
}
beforeEach(() => {
  vi.clearAllMocks();
  native.value = false;
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  getUserMedia.mockResolvedValue(stream);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
    callback(new Blob(["photo"], { type: "image/jpeg" })),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("camera and gallery capture", () => {
  it("requests a rear-facing camera without audio and captures a bounded JPEG once", async () => {
    render(<ScanPhotoPicker disabled={false} onPhoto={onPhoto} />);
    expect(getUserMedia).not.toHaveBeenCalled();
    open();
    expect(screen.getByRole("button", { name: "Use photo" })).toBeDisabled();
    await ready();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    expect(onPhoto).toHaveBeenCalledOnce();
    expect(onPhoto.mock.calls[0]![0]).toMatchObject({
      name: "food-camera.jpg",
      type: "image/jpeg",
    });
    expect(vi.mocked(HTMLCanvasElement.prototype.getContext).mock.contexts[0]).toMatchObject({
      width: 1024,
      height: 576,
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains blocked permissions, retries and leaves gallery selection available", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    render(<ScanPhotoPicker disabled={false} onPhoto={onPhoto} />);
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Allow camera access/);
    fireEvent.click(screen.getByRole("button", { name: "Try camera again" }));
    await ready();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    fireEvent.click(screen.getByRole("button", { name: "Choose photo instead" }));
    expect(click).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(onPhoto).not.toHaveBeenCalled();
  });

  it("stops a late permission result after closing, without reopening the camera", async () => {
    let resolve!: (value: MediaStream) => void;
    getUserMedia.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<ScanPhotoPicker disabled={false} onPhoto={onPhoto} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => resolve(stream));
    expect(stop).toHaveBeenCalledOnce();
    expect(onPhoto).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not submit an asynchronously encoded photo after closing", async () => {
    let encode!: BlobCallback;
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((cb) => {
      encode = cb;
    });
    render(<ScanPhotoPicker disabled={false} onPhoto={onPhoto} />);
    open();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    act(() => encode(new Blob(["photo"])));
    expect(onPhoto).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("releases the camera on navigation/unmount and when the page is hidden", async () => {
    const view = render(<ScanPhotoPicker disabled={false} onPhoto={onPhoto} />);
    open();
    await ready();
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
    render(<ScanPhotoPicker disabled={false} onPhoto={onPhoto} />);
    open();
    await ready();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(stop).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    visibility.mockRestore();
  });

  it.each(["native", "unsupported", "insecure"])(
    "preserves the system camera picker for %s environments",
    (environment) => {
      native.value = environment === "native";
      if (environment === "unsupported")
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
      if (environment === "insecure") vi.stubGlobal("isSecureContext", false);
      const click = vi.spyOn(HTMLInputElement.prototype, "click");
      render(<ScanPhotoPicker disabled={false} onPhoto={onPhoto} />);
      open();
      expect(click).toHaveBeenCalledOnce();
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Take a food photo")).toHaveAttribute("capture", "environment");
    },
  );

  it("handles photo reselection, cancellation and disabled actions without opening the camera", () => {
    const view = render(<ScanPhotoPicker disabled={false} onPhoto={onPhoto} />);
    const input = screen.getByLabelText("Choose a food photo");
    const file = new File(["photo"], "food.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [] } });
    expect(onPhoto).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPhoto).toHaveBeenCalledTimes(2);
    view.rerender(<ScanPhotoPicker disabled onPhoto={onPhoto} />);
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeDisabled();
  });
});
