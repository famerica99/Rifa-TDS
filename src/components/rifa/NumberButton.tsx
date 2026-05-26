import { cn } from "@/lib/utils";

export type NumberStatus = "free" | "selected" | "reserved" | "paid";

interface NumberButtonProps {
  number: number;
  status: NumberStatus;
  onToggle: (n: number) => void;
}

const NumberButton = ({ number, status, onToggle }: NumberButtonProps) => {
  return (
    <button
      onClick={() => status === "free" || status === "selected" ? onToggle(number) : null}
      disabled={status === "reserved" || status === "paid"}
      className={cn(
        "flex items-center justify-center rounded-md border-2 text-sm font-bold transition-colors",
        "h-10 w-10 md:h-12 md:w-12",
        {
          "bg-[hsl(var(--num-free-bg))] border-[hsl(var(--num-free-bg))] text-[hsl(var(--num-free-fg))] hover:opacity-80": status === "free",
          "bg-[hsl(var(--num-selected-bg))] border-[hsl(var(--num-selected-bg))] text-[hsl(var(--num-selected-fg))]": status === "selected",
          "bg-[hsl(var(--num-reserved-bg))] border-[hsl(var(--num-reserved-bg))] text-[hsl(var(--num-reserved-fg))] opacity-80 cursor-not-allowed": status === "reserved",
          "bg-[hsl(var(--num-paid-bg))] border-[hsl(var(--num-paid-bg))] text-[hsl(var(--num-paid-fg))] opacity-80 cursor-not-allowed": status === "paid",
        }
      )}
    >
      {number.toString().padStart(3, "0")}
    </button>
  );
};

export default NumberButton;
