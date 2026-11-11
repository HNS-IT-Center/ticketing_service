import { GalleryTrigger, MediaGallery } from "@/components/app/MediaGallery";
import { cn } from "@/lib/utils";

/** A row of photo thumbnails that open the shared pop-up viewer. */
export function PhotoStrip({
  photos,
  size = "md",
  max,
}: {
  photos: { url: string; title: string; meta?: string }[];
  size?: "sm" | "md";
  /** Show this many thumbnails and a "+N" tile for the rest. */
  max?: number;
}) {
  if (photos.length === 0) return null;
  const shown = max ? photos.slice(0, max) : photos;
  const rest = photos.length - shown.length;
  const box = size === "sm" ? "size-11" : "size-20";
  return (
    <MediaGallery items={photos.map((p) => ({ url: p.url, fileType: "image", title: p.title, meta: p.meta }))}>
      <ul className="flex flex-wrap gap-2">
        {shown.map((p, i) => (
          <li key={`${p.url}_${i}`}>
            <GalleryTrigger
              index={i}
              title={p.title}
              className={cn("block overflow-hidden rounded-md border border-border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50", box)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.title} loading="lazy" className="size-full object-cover" />
            </GalleryTrigger>
          </li>
        ))}
        {rest > 0 && (
          <li>
            <GalleryTrigger
              index={shown.length}
              title={`${rest} foto lainnya`}
              className={cn("flex items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold text-muted-foreground", box)}
            >
              +{rest}
            </GalleryTrigger>
          </li>
        )}
      </ul>
    </MediaGallery>
  );
}
