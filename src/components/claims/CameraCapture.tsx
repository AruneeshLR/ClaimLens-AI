import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCcw, SwitchCamera, X, Check, AlertTriangle, Loader2 } from "lucide-react";
import { canvasToJpeg } from "@/lib/image-metrics";

type Props = {
  open: boolean;
  title: string;
  hint?: string;
  onClose: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
};

/**
 * Live camera capture only — no gallery fallback. Uses getUserMedia with
 * front/rear switching where the device supports it.
 */
export function CameraCapture({ open, title, hint, onClose, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [canSwitch, setCanSwitch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Live camera needs a secure (https) connection and a browser with camera support.");
      return;
    }
    setStarting(true);
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings, then try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No camera was found on this device."
            : name === "NotReadableError"
              ? "The camera is being used by another app. Close it and try again."
              : "Could not start the camera.",
      );
    } finally {
      setStarting(false);
    }
  }, [facing, stop]);

  useEffect(() => {
    if (open && !preview) void start();
    if (!open) stop();
    return () => {
      if (!open) stop();
    };
  }, [open, facing, preview, start, stop]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!open && preview) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
  }, [open, preview]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await canvasToJpeg(canvas);
    stop();
    setPreview({ blob, url: URL.createObjectURL(blob) });
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const confirm = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await onConfirm(preview.blob);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy text-navy-foreground" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-navy-foreground/60">Live capture</p>
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <Button variant="heroOutline" size="icon" onClick={onClose} aria-label="Close camera">
          <X />
        </Button>
      </div>

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 items-center justify-center overflow-hidden">
        {preview ? (
          <img src={preview.url} alt="Captured preview" className="max-h-full max-w-full object-contain" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
            {!error && (
              <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-sky/70">
                <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-sky/25 to-transparent animate-scan" />
              </div>
            )}
            {starting && <Loader2 className="absolute h-8 w-8 animate-spin" />}
          </>
        )}
        {error && (
          <div className="absolute inset-x-6 rounded-2xl bg-card p-5 text-card-foreground shadow-elevated">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
              <div className="space-y-3">
                <p className="text-sm">{error}</p>
                <Button size="sm" onClick={() => void start()}>
                  <RefreshCcw /> Try again
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {hint && !preview && <p className="px-6 pt-3 text-center text-sm text-navy-foreground/75">{hint}</p>}

      <div className="flex items-center justify-center gap-6 px-6 py-6 safe-bottom">
        {preview ? (
          <>
            <Button variant="heroOutline" size="lg" onClick={retake} disabled={saving}>
              <RefreshCcw /> Retake
            </Button>
            <Button variant="hero" size="lg" onClick={confirm} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />} Use photo
            </Button>
          </>
        ) : (
          <>
            <span className="w-11" />
            <button
              type="button"
              onClick={capture}
              disabled={!!error || starting}
              aria-label="Capture photo"
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-navy-foreground/80 bg-navy-foreground/10 transition active:scale-95 disabled:opacity-40"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-foreground text-navy">
                <Camera className="h-6 w-6" />
              </span>
            </button>
            <Button
              variant="heroOutline"
              size="icon"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              disabled={!canSwitch}
              aria-label="Switch camera"
            >
              <SwitchCamera />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
