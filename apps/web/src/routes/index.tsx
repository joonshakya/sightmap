import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import React, { useState } from "react";

export const Route = createFileRoute("/")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
    return { session };
  },
});

const STEP_SIZE_LABELS = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

type StepSizeEnum = keyof typeof STEP_SIZE_LABELS;

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const queryClient = useQueryClient();

  // Buildings and floors
  const buildingsQuery = useQuery(
    trpc.building.getAll.queryOptions()
  );
  const createBuilding = useMutation(
    trpc.building.create.mutationOptions({
      onSuccess: () => {
        buildingsQuery.refetch();
        toast.success("Building created!");
        setBuildingName("");
      },
    })
  );
  const deleteBuilding = useMutation(
    trpc.building.delete.mutationOptions({
      onSuccess: () => {
        buildingsQuery.refetch();
        toast.success("Building deleted!");
        if (selectedBuildingId) setSelectedBuildingId(null);
      },
    })
  );
  const createFloor = useMutation(
    trpc.building.createFloor.mutationOptions({
      onSuccess: () => {
        buildingsQuery.refetch();
        toast.success("Floor created!");
        setFloorName("");
        setFloorLevel(1);
      },
    })
  );
  const deleteFloor = useMutation(
    trpc.building.deleteFloor.mutationOptions({
      onSuccess: () => {
        buildingsQuery.refetch();
        toast.success("Floor deleted!");
      },
    })
  );

  // User settings
  const userSettingsQuery = useQuery(
    trpc.userSettings.get.queryOptions()
  );
  const updateStepSize = useMutation(
    trpc.userSettings.updateStepSize.mutationOptions({
      onSuccess: () => {
        userSettingsQuery.refetch();
        toast.success("Step size updated!");
      },
    })
  );

  // Local state for forms
  const [buildingName, setBuildingName] = useState("");
  const [floorName, setFloorName] = useState("");
  const [floorLevel, setFloorLevel] = useState(1);
  const [stepSize, setStepSize] = useState<StepSizeEnum>("MEDIUM");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [confirmDeleteBuildingId, setConfirmDeleteBuildingId] =
    useState<string | null>(null);
  const [confirmDeleteFloorId, setConfirmDeleteFloorId] = useState<
    string | null
  >(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<
    string | null
  >(null);

  type Building = NonNullable<typeof buildingsQuery.data>[number];
  type Floor = Building["floors"][number] & { level?: number };

  const selectedBuilding = buildingsQuery.data?.find(
    (b) => b.id === selectedBuildingId
  );

  // Sync stepSize with userSettingsQuery
  React.useEffect(() => {
    const stepSize = (
      userSettingsQuery.data as
        | { stepSize?: StepSizeEnum }
        | undefined
    )?.stepSize;
    if (stepSize) {
      setStepSize(stepSize);
    }
  }, [userSettingsQuery.data]);

  // Handle update step size
  const handleUpdateStepSize = (value: StepSizeEnum) => {
    setStepSize(value);
    updateStepSize.mutate({ stepSize: value });
    setPopoverOpen(false);
  };

  return (
    <div className="w-full max-w-screen-2xl px-8 py-8 space-y-8">
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="mb-4">Welcome {session.data?.user.name}</p>

      {/* iPad-like two-pane layout */}
      <div className="flex gap-6 h-[500px]">
        {/* Left: Building List */}
        <div className="w-1/3 bg-muted rounded-lg shadow-inner overflow-y-auto flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold mb-2">Buildings</h2>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (buildingName) {
                  createBuilding.mutate({
                    name: buildingName,
                  });
                }
              }}
            >
              <Input
                placeholder="Building Name"
                value={buildingName}
                onChange={(e) => setBuildingName(e.target.value)}
              />
              <Button
                type="submit"
                disabled={createBuilding.isPending || !buildingName}
              >
                Add
              </Button>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto">
            {buildingsQuery.isLoading && (
              <p className="p-4">Loading...</p>
            )}
            {buildingsQuery.data?.length === 0 && (
              <p className="p-4">No buildings found.</p>
            )}
            <ul>
              {buildingsQuery.data?.map((building: Building) => (
                <li
                  key={building.id}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer border-b transition-colors ${
                    selectedBuildingId === building.id
                      ? "bg-primary/10 font-bold"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedBuildingId(building.id)}
                >
                  <span>{building.name}</span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteBuildingId(building.id);
                        }}
                      >
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Are you sure you want to delete this
                          building?
                        </AlertDialogTitle>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel
                          onClick={() =>
                            setConfirmDeleteBuildingId(null)
                          }
                        >
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            deleteBuilding.mutate({
                              id: building.id,
                            });
                            setConfirmDeleteBuildingId(null);
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Right: Floors for selected building */}
        <div className="w-2/3 bg-card rounded-lg shadow-inner p-6 flex flex-col">
          {!selectedBuilding ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <span>Select a building to view its floors</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {selectedBuilding.name}
                </h2>
              </div>
              <div className="mb-4">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (floorName) {
                      createFloor.mutate({
                        buildingId: selectedBuilding.id,
                        name: floorName,
                        level: floorLevel,
                      });
                    }
                  }}
                >
                  <Input
                    placeholder="Floor Name"
                    value={floorName}
                    onChange={(e) => setFloorName(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Level"
                    min={1}
                    value={floorLevel}
                    onChange={(e) =>
                      setFloorLevel(Number(e.target.value))
                    }
                    className="w-20"
                  />
                  <Button
                    type="submit"
                    disabled={createFloor.isPending || !floorName}
                  >
                    Add Floor
                  </Button>
                </form>
              </div>
              <div className="flex-1 overflow-y-auto">
                <h3 className="font-semibold mb-2">Floors</h3>
                {selectedBuilding.floors.length === 0 && (
                  <p className="text-gray-400">No floors found.</p>
                )}
                <ul className="space-y-2">
                  {selectedBuilding.floors.map((floor: Floor) => (
                    <li
                      key={floor.id}
                      className="flex items-center justify-between border rounded px-3 py-2 bg-muted cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/floors/${floor.id}`)
                      }
                    >
                      <span>
                        {floor.name} (Level {floor.level})
                      </span>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              setConfirmDeleteFloorId(floor.id)
                            }
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Are you sure you want to delete this
                              floor?
                            </AlertDialogTitle>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              onClick={() =>
                                setConfirmDeleteFloorId(null)
                              }
                            >
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                deleteFloor.mutate({ id: floor.id });
                                setConfirmDeleteFloorId(null);
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
