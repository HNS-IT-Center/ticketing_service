import { AutoSubmitSelect } from "@/components/app/AutoSubmitSelect";
import { FilterBarField } from "@/components/app/FilterBar";
import type { ProgressOption } from "@/lib/ticket-list-filter";

/**
 * The "Progres" filter inside a list's FilterBar form: every status the list
 * can hold, with counts. Applies as soon as one is picked (AutoSubmitSelect);
 * without JavaScript the form's Search button submits it.
 */
export function ProgressSelect({
  options,
  value,
  id,
  name = "status",
  label = "Progres",
  className,
}: {
  options: ProgressOption[];
  /** The current value; "all" and "" both mean every progress. */
  value: string;
  id: string;
  name?: string;
  label?: string;
  className?: string;
}) {
  return (
    <FilterBarField label={label} htmlFor={id} className={className ?? "md:w-56"}>
      <AutoSubmitSelect key={value} id={id} name={name} defaultValue={value === "all" ? "" : value}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </AutoSubmitSelect>
    </FilterBarField>
  );
}
