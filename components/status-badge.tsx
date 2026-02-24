import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  synced: { label: "Synced", className: "bg-blue-100 text-blue-800" },
  transcribing: {
    label: "Transcribing",
    className: "bg-yellow-100 text-yellow-800",
  },
  transcribed: {
    label: "Transcribed",
    className: "bg-indigo-100 text-indigo-800",
  },
  analyzing: { label: "Analyzing", className: "bg-orange-100 text-orange-800" },
  analyzed: { label: "Analyzed", className: "bg-green-100 text-green-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  skipped: { label: "Skipped", className: "bg-gray-100 text-gray-800" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-800",
  };
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
