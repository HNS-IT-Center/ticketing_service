import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: React.ReactNode;
  /** The id of the control inside, so the label is clickable and read out with it. */
  htmlFor: string;
  required?: boolean;
  /** Shown after the label in muted text, e.g. "(opsional)". */
  hint?: React.ReactNode;
  /** One line of guidance under the label. */
  help?: React.ReactNode;
  /** Shown in red under the control; give the control aria-invalid as well. */
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * Label, control, help and error in the same order on every form. The label
 * is always visible — no placeholder-as-label — and is tied to the control.
 */
export function FormField({ label, htmlFor, required, hint, help, error, children, className }: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <span aria-hidden="true"> *</span>}
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
