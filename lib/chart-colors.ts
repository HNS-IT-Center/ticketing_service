/**
 * The charts' categorical colours, in their fixed order (blue, orange, aqua,
 * yellow, magenta): the validated default palette, adjacent pairs passing the
 * colour-blind checks. Kept out of the "use client" chart module so a server
 * component can read the values — imported from there it gets a reference,
 * not the array.
 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;
