import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "./use-auth";

export function useMyClaims(userId: string | undefined) {
  useRealtimeInvalidate("claims", userId ? `user_id=eq.${userId}` : undefined, [["my-claims", userId]], !!userId);
  return useQuery({
    queryKey: ["my-claims", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useNotifications(userId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["notifications", userId, limit],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useClaimEvidence(claimId: string | undefined) {
  return useQuery({
    queryKey: ["evidence", claimId],
    enabled: !!claimId,
    queryFn: async () => {
      const { data, error } = await supabase.from("evidence").select("*").eq("claim_id", claimId!).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}
