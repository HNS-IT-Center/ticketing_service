export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-4 w-36 rounded" />
        <div className="skeleton h-8 w-64 rounded" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          <div className="skeleton h-64 w-full rounded-xl" />
          <div className="skeleton h-96 w-full rounded-xl" />
        </div>
        <div className="skeleton h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
