import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, ArrowLeft, MapPin } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/rooms/$fromRoomId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { fromRoomId } = Route.useParams();

  const navigate = Route.useNavigate();

  const roomData = useQuery(
    trpc.room.getRoomById.queryOptions({ roomId: fromRoomId })
  );

  if (roomData.isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (roomData.error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">
            Error
          </h2>
          <p className="text-gray-600">Failed to load room data</p>
        </div>
      </div>
    );
  }

  const room = roomData.data;
  const fromPaths = room?.fromPaths || [];

  return (
    <div className="bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Home
          </Link>
        </div>

        {/* Room Info */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {room?.name}
          </h1>
          <p className="text-lg text-gray-600">
            Room {room?.number} • {room?.floor.building.name} • Floor{" "}
            {room?.floor.level}
          </p>
        </div>

        {/* Paths */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Choose destination
          </h2>

          {fromPaths.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No paths available
                  </h3>
                  <p className="text-gray-600">
                    There are no navigation paths from this room yet.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {fromPaths.map((path) => (
                <button
                  key={path.toRoom.id}
                  onClick={() => {
                    navigate({
                      href: `/rooms/${fromRoomId}/${path.toRoom.id}`,
                    });
                  }}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          <p>
                            {path.toRoom.name} (Room{" "}
                            {path.toRoom.number})
                          </p>
                        </CardTitle>
                        <Badge variant="secondary">
                          {path.anchors?.length - 2 || 0} turns
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          {path.instructionSet
                            ?.descriptiveInstructions?.length ||
                            0}{" "}
                          instruction steps available
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
