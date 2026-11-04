import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_DOC_MIME, BUCKET, MAX_FILE_BYTES, type DocKind, type Evidence } from "./claims";

function ext(mime: string) {
  return mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

async function uploadFile(userId: string, claimId: string, blob: Blob, mime: string) {
  if (blob.size > MAX_FILE_BYTES) throw new Error("File is larger than 10 MB");
  const path = `${userId}/${claimId}/${crypto.randomUUID()}.${ext(mime)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

export async function addPhotoEvidence(args: {
  userId: string;
  claimId: string;
  angle: string;
  blob: Blob;
  defaults: { incident_date: string | null; incident_location: string | null };
}): Promise<Evidence> {
  const path = await uploadFile(args.userId, args.claimId, args.blob, "image/jpeg");
  const { data, error } = await supabase
    .from("evidence")
    .insert({
      claim_id: args.claimId,
      kind: "photo",
      angle: args.angle,
      storage_path: path,
      file_name: `${args.angle}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: args.blob.size,
      captured_live: true,
      incident_date: args.defaults.incident_date,
      incident_location: args.defaults.incident_location,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return data;
}

export async function addDocumentEvidence(userId: string, claimId: string, kind: DocKind, file: File): Promise<Evidence> {
  if (!ALLOWED_DOC_MIME.includes(file.type)) throw new Error("Unsupported file type. Use PDF, JPG, PNG or WEBP.");
  if (file.size === 0) throw new Error("The file is empty.");
  // Signature check before upload
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  const isJpg = head[0] === 0xff && head[1] === 0xd8;
  const isPng = head[0] === 0x89 && head[1] === 0x50;
  const isWebp = head[8] === 0x57 && head[9] === 0x45;
  const valid =
    (file.type === "application/pdf" && isPdf) ||
    (file.type === "image/jpeg" && isJpg) ||
    (file.type === "image/png" && isPng) ||
    (file.type === "image/webp" && isWebp);
  if (!valid) throw new Error("The file content does not match its type — it may be corrupted.");
  const path = await uploadFile(userId, claimId, file, file.type);
  const { data, error } = await supabase
    .from("evidence")
    .insert({
      claim_id: claimId,
      kind,
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
      captured_live: false,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return data;
}

export async function removeEvidence(ev: Pick<Evidence, "id" | "storage_path">) {
  const { error } = await supabase.from("evidence").delete().eq("id", ev.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([ev.storage_path]);
}

export async function downloadBlob(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Could not load the photo");
  return data;
}
