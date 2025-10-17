import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

import { trpc } from "@/utils/trpc";
import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

const STEP_SIZE_LABELS = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

type StepSizeEnum = keyof typeof STEP_SIZE_LABELS;

function StepSizeDropdown() {
  const userSettingsQuery = useQuery(
    trpc.userSettings.get.queryOptions()
  );
  const updateStepSize = useMutation(
    trpc.userSettings.updateStepSize.mutationOptions({
      onSuccess: () => userSettingsQuery.refetch(),
    })
  );
  const [stepSize, setStepSize] = useState<StepSizeEnum>("MEDIUM");

  React.useEffect(() => {
    if (userSettingsQuery.data?.stepSize) {
      setStepSize(userSettingsQuery.data.stepSize as StepSizeEnum);
    }
  }, [userSettingsQuery.data?.stepSize]);

  const handleUpdateStepSize = (value: StepSizeEnum) => {
    setStepSize(value);
    updateStepSize.mutate({ stepSize: value });
  };

  const icons = {
    SMALL: (
      <svg
        className="w-4 h-4 mr-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 20 20"
      >
        <circle cx="10" cy="10" r="4" />
      </svg>
    ),
    MEDIUM: (
      <svg
        className="w-5 h-5 mr-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 20 20"
      >
        <circle cx="10" cy="10" r="6" />
      </svg>
    ),
    LARGE: (
      <svg
        className="w-6 h-6 mr-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 20 20"
      >
        <circle cx="10" cy="10" r="8" />
      </svg>
    ),
  };

  return (
    <>
      <DropdownMenuLabel className="pt-2 pb-1 text-xs text-muted-foreground tracking-widest">
        Step Size
      </DropdownMenuLabel>
      <div className="flex flex-col gap-1 px-1 pb-1">
        {(["SMALL", "MEDIUM", "LARGE"] as StepSizeEnum[]).map(
          (size) => (
            <DropdownMenuItem
              key={size}
              onClick={() => handleUpdateStepSize(size)}
              className={`flex items-center rounded-md transition-colors ${
                stepSize === size
                  ? "bg-primary/10 text-primary font-semibold"
                  : ""
              }`}
            >
              {icons[size]}
              <span>{STEP_SIZE_LABELS[size]}</span>
              {stepSize === size && (
                <span className="ml-auto text-xs text-primary font-bold">
                  ✓
                </span>
              )}
            </DropdownMenuItem>
          )
        )}
      </div>
      <DropdownMenuSeparator />
    </>
  );
}

export default function UserMenu() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!session) {
    return (
      <Button variant="outline" asChild>
        <Link to="/login">Sign In</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">{session.user.name}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
        <StepSizeDropdown />
        <DropdownMenuItem asChild>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: "/",
                    });
                  },
                },
              });
            }}
          >
            Sign Out
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
