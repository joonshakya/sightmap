import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/floors/$floorId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { floorId } = Route.useParams();

  return <div>Hello "/floors/$floorId"!</div>;
}
