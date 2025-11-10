import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepSize } from "@sightmap/common/prisma/enums";
import { toTitleCase } from "@sightmap/common";

interface StepSizeSelectorProps {
  value?: StepSize;
  onChange: (stepSize: StepSize) => void;
  className?: string;
}

const STEP_SIZE_STORAGE_KEY = "sightmap-step-size";

export default function StepSizeSelector({
  value,
  onChange,
  className = "",
}: StepSizeSelectorProps) {
  const [stepSize, setStepSize] = useState<StepSize>(
    value || "MEDIUM"
  );

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STEP_SIZE_STORAGE_KEY);
    if (
      stored &&
      Object.values(StepSize).includes(stored as StepSize)
    ) {
      const storedStepSize = stored as StepSize;
      setStepSize(storedStepSize);
      onChange(storedStepSize);
    } else if (value) {
      setStepSize(value);
    }
  }, []);

  // Update when value prop changes
  useEffect(() => {
    if (value && value !== stepSize) {
      setStepSize(value);
    }
  }, [value]);

  const handleChange = (newStepSize: StepSize) => {
    setStepSize(newStepSize);
    localStorage.setItem(STEP_SIZE_STORAGE_KEY, newStepSize);
    onChange(newStepSize);
  };

  const getStepSizeLabel = (size: StepSize) => {
    const labels = {
      SMALL: "Small Steps",
      MEDIUM: "Medium Steps",
      LARGE: "Large Steps",
    };
    return labels[size] || toTitleCase(size);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-sm font-medium">Step Size:</span>
      <Select value={stepSize} onValueChange={handleChange}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(StepSize).map((size) => (
            <SelectItem key={size} value={size}>
              {getStepSizeLabel(size)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
