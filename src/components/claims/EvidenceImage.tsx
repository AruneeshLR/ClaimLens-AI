import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET } from "@/lib/claims";
import { cn } from "@/lib/utils";
import { ImageOff, Loader2 } from "lucide-react";

/** Short-lived signed URL for a private evidence file (RLS-checked by storage). */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed-url", path],
    enabled: !!path,
    staleTime: 8 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function EvidenceImage({
  path,
  alt,
  className,
  onClick,
}: {
  path: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const { data: url, isLoading, isError } = useSignedUrl(path);
  if (isLoading)
    return (
      <div className={cn("flex items-center justify-center bg-muted", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (isError || !url)
    return (
      <div className={cn("flex items-center justify-center bg-muted", className)}>
        <ImageOff className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  return (
    <img
      src={url}
      alt={alt}
      onClick={onClick}
      className={cn("object-cover", onClick && "cursor-zoom-in", className)}
      draggable={false}
    />
  );
}
