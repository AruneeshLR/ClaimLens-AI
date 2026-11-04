import { useRef, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useSignedUrl } from "@/components/claims/EvidenceImage";

export function ImageZoom({ path, title, description, open, onOpenChange }: { path: string | null; title: string; description?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: url } = useSignedUrl(path);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const reset = () => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div
          className="relative h-[65vh] cursor-grab overflow-hidden rounded-xl bg-navy active:cursor-grabbing"
          onWheel={(e) => setZoom((z) => Math.min(6, Math.max(1, z - e.deltaY * 0.002)))}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
          }}
          onPointerMove={(e) => drag.current && setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
          onPointerUp={() => (drag.current = null)}
        >
          {url && (
            <img
              src={url}
              alt={title}
              draggable={false}
              className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain transition-transform duration-75"
              style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})` }}
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out"><ZoomOut /></Button>
          <Slider value={[zoom]} min={1} max={6} step={0.1} onValueChange={([v]) => setZoom(v)} className="flex-1" />
          <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.min(6, z + 0.5))} aria-label="Zoom in"><ZoomIn /></Button>
          <Button variant="ghost" size="icon" onClick={reset} aria-label="Reset"><RotateCcw /></Button>
          <span className="w-12 text-right font-mono text-xs">{zoom.toFixed(1)}×</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
