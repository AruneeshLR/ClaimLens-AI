import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Trash2, Upload, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOC_HINTS, DOC_KINDS, friendlyError, type DocKind, type Evidence } from "@/lib/claims";
import { addDocumentEvidence, removeEvidence } from "@/lib/evidence-client";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET } from "@/lib/claims";

export async function openEvidenceFile(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) {
    toast.error("Could not open the file");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function DocumentUploader({
  claimId,
  userId,
  kind,
  docs,
  required,
  onChanged,
  canRemove = true,
}: {
  claimId: string;
  userId: string;
  kind: DocKind;
  docs: Evidence[];
  required?: boolean;
  onChanged: () => void;
  canRemove?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      try {
        await addDocumentEvidence(userId, claimId, kind, f);
        toast.success(`${f.name} uploaded`);
      } catch (e) {
        toast.error(`${f.name}: ${friendlyError(e)}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    onChanged();
  };

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {DOC_KINDS[kind]} {required ? <span className="text-destructive">*</span> : <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
          </p>
          {DOC_HINTS[kind] && <p className="text-xs text-muted-foreground">{DOC_HINTS[kind]}</p>}
          <p className="text-xs text-muted-foreground">PDF, JPG, PNG or WEBP · max 10 MB</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload
        </Button>
        <input
          ref={input}
          type="file"
          className="hidden"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple={kind !== "claim_form" && kind !== "pan_card"}
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-info" />
              <span className="min-w-0 flex-1 truncate">{d.file_name}</span>
              <span className="text-xs text-muted-foreground">{Math.round(d.size_bytes / 1024)} KB</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void openEvidenceFile(d.storage_path)} aria-label="Open">
                <ExternalLink />
              </Button>
              {canRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Remove"
                  onClick={async () => {
                    try {
                      await removeEvidence(d);
                      onChanged();
                    } catch (e) {
                      toast.error(friendlyError(e));
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
