"use client";

interface ChartSkeletonProps {
  height?: number;
}

export function ChartSkeleton({ height = 280 }: ChartSkeletonProps) {
  return (
    <div className="w-full" style={{ height }}>
      {/* Chart area skeleton */}
      <div className="relative h-full">
        {/* Animated gradient background */}
        <div className="absolute inset-0 overflow-hidden rounded-lg">
          <div
            className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-shimmer"
            style={{
              backgroundSize: '200% 100%',
            }}
          />
        </div>

        {/* Fake bar chart silhouette */}
        <div className="absolute bottom-8 left-10 right-10 flex items-end justify-around gap-2 h-[70%]">
          {[0.3, 0.5, 0.7, 0.4, 0.8, 0.6, 0.45, 0.9, 0.55, 0.35, 0.65, 0.5, 0.75, 0.4].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-gray-200/60 rounded-t"
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>

        {/* Fake Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between py-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-2 w-6 bg-gray-200/40 rounded" />
          ))}
        </div>

        {/* Fake X-axis labels */}
        <div className="absolute bottom-0 left-10 right-10 h-6 flex justify-between">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-2 w-8 bg-gray-200/40 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

// Legend skeleton with horizontal scroll container
interface LegendSkeletonProps {
  itemCount?: number;
}

export function LegendSkeleton({ itemCount = 6 }: LegendSkeletonProps) {
  return (
    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 overflow-x-auto scrollbar-hide">
      <div className="flex items-center gap-4 flex-nowrap">
        {Array.from({ length: itemCount }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 flex-shrink-0">
            <div className="w-3 h-3 rounded-sm bg-gray-200/60" />
            <div className="h-2 w-16 bg-gray-200/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
