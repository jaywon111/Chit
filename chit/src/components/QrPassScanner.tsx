import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { Icon } from "./Icon.js";

type ScanPhase = "idle" | "opening" | "camera" | "closing" | "image";
interface ScanJob {
  camera: boolean;
  cancelled: boolean;
  finishCamera: (text: string | null) => void;
}

function releaseVideo(surface: HTMLDivElement | null): void {
  surface?.querySelectorAll("video").forEach((video) => {
    const stream = video.srcObject;
    if (typeof MediaStream !== "undefined" && stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  });
}

export function QrPassScanner({ enabled, resetToken, onBegin }: {
  enabled: boolean;
  resetToken: number;
  onBegin: () => (text: string) => void;
}): JSX.Element {
  const id = useId();
  const surface = useRef<HTMLDivElement>(null);
  const galleryReader = useRef<Html5Qrcode | null>(null);
  const job = useRef<ScanJob | null>(null);
  const mounted = useRef(false);
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback((): void => {
    const current = job.current;
    if (!current || current.cancelled) return;
    current.cancelled = true;
    current.finishCamera(null);
    if (current.camera && mounted.current) setPhase("closing");
  }, []);

  useLayoutEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);
  useLayoutEffect(() => { cancel(); setError(null); }, [resetToken, cancel]);
  useEffect(() => {
    mounted.current = true;
    const closeCamera = (): void => { if (job.current?.camera) cancel(); };
    const onVisibilityChange = (): void => { if (document.hidden) closeCamera(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", closeCamera);
    return () => {
      mounted.current = false;
      cancel();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", closeCamera);
    };
  }, [cancel]);

  async function scan(file?: File): Promise<void> {
    if (!enabled || job.current) return;
    const accept = onBegin();
    setError(null);
    if (file && ((file.type && !file.type.startsWith("image/")) || file.size < 1 || file.size > 20 * 1024 * 1024)) {
      setError("Choose a saved QR pass image under 20 MB.");
      return;
    }
    if (!file && !navigator.mediaDevices?.getUserMedia) {
      setError("The camera isn’t available here. Upload a saved pass image instead, or open Chit in your browser.");
      return;
    }

    const current: ScanJob = { camera: !file, cancelled: false, finishCamera: () => {} };
    // A promise also captures a decode that comes in before start() settles.
    const cameraResult = new Promise<string | null>((resolve) => { current.finishCamera = resolve; });
    const target = surface.current;
    job.current = current;
    setPhase(file ? "image" : "opening");
    let reader: Html5Qrcode | null = null;
    let started = false;
    let decoded: string | null = null;
    let failure: string | null = null;
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (current.cancelled) return;
      reader = (file && galleryReader.current) || new Html5Qrcode(id, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      });
      if (file) {
        galleryReader.current = reader;
        // Decode on-device without displaying the selected image.
        decoded = await reader.scanFile(file, false);
      } else {
        await reader.start({ facingMode: "environment" }, { fps: 10 }, current.finishCamera, () => {});
        started = true;
        if (current.cancelled) return;
        setPhase("camera");
        decoded = await cameraResult;
      }
    } catch {
      failure = file
        ? "We couldn’t find a QR code in that image. Choose a clear picture of the entire Chit pass."
        : "Couldn’t open the camera. Allow camera access and try again, or upload a saved pass image.";
    } finally {
      // Close before delivering the first decode, including when the user
      // leaves while the browser is resolving camera permission.
      if (reader && !file) {
        try { if (started || reader.isScanning) await reader.stop(); }
        catch { /* A failed start may leave the library unable to stop itself. */ }
        releaseVideo(target);
      }
      if (reader && target?.isConnected) {
        try { reader.clear(); } catch { target.replaceChildren(); }
      }
      job.current = null;
      if (mounted.current) setPhase("idle");
    }
    if (current.cancelled || !mounted.current) return;
    if (decoded !== null) accept(decoded);
    else if (failure) setError(failure);
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void scan(file);
  }

  const cameraOpen = phase === "opening" || phase === "camera" || phase === "closing";
  const canChoose = enabled && phase === "idle";
  const status = phase === "opening" ? "Waiting for camera access…"
    : phase === "camera" ? "Point your camera at the QR code."
    : phase === "closing" ? "Closing camera…"
    : phase === "image" ? "Reading the image on this device…" : null;

  return <section className="panel qr-scanner" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>Use your Chit pass</h2>
    <div className="scan-actions">
      {cameraOpen
        ? <button className="button secondary" type="button" onClick={cancel} disabled={phase === "closing"}><Icon name="x" size={19} /> Stop camera</button>
        : <button className="button primary" type="button" onClick={() => { void scan(); }} disabled={!canChoose}><Icon name="qr" size={19} /> Scan QR Code</button>}
      <label className={`button secondary file-button${canChoose ? "" : " disabled"}`}>
        <Icon name="upload" size={19} /> Upload QR Pass Image
        <input type="file" accept="image/*" onChange={selectImage} disabled={!canChoose} />
      </label>
    </div>
    <div className="qr-camera" id={id} ref={surface} hidden={!cameraOpen} />
    {status && <p className="scan-status" role="status">{status}</p>}
    {error && <div className="alert error-alert" role="alert"><Icon name="alert" size={19} /><span>{error}</span></div>}
    <p className="pass-privacy"><Icon name="lock" size={16} /> <span>Images stay on this device. No wallet needed.</span></p>
  </section>;
}
