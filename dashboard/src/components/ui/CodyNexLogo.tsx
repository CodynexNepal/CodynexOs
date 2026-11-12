import Image from "next/image";
import { cn } from "@/lib/utils";

export function CodyNexLogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <Image
      src="/codynexos_logo.png"
      alt="CodyNex OS"
      width={40}
      height={40}
      priority
      className={cn("shrink-0 rounded-md object-contain", className)}
    />
  );
}
