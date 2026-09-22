export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-4 w-72 rounded" />
      </div>
      {[0, 1, 2].map((section) => (
        <div key={section} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="skeleton mb-4 h-5 w-56 rounded" />
          <div className="flex flex-col gap-3">
            {[0, 1].map((row) => (
              <div key={row} className="skeleton h-24 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
