import { ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-xl",
          inverted ? "bg-sky text-navy" : "bg-primary text-primary-foreground",
        )}
      >
        <ScanSearch className="h-4.5 w-4.5" />
      </span>
      <span className={cn("text-lg", inverted ? "text-navy-foreground" : "text-foreground")}>
        ClaimLens<span className={inverted ? "text-sky" : "text-info"}> AI</span>
      </span>
    </span>
  );
}
