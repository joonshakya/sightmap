import * as React from "react";

import { cn } from "@/lib/utils";

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const CircularProgress = React.forwardRef<
  SVGSVGElement,
  CircularProgressProps
>(
  (
    { value, size = 24, strokeWidth = 2, className, ...props },
    ref
  ) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDasharray = circumference;
    const strokeDashoffset =
      circumference - (value / 100) * circumference;

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        className={cn("transform -rotate-90", className)}
        {...props}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-blue-600 transition-all duration-300 ease-out"
        />
      </svg>
    );
  }
);

CircularProgress.displayName = "CircularProgress";

export { CircularProgress };
