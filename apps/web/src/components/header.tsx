import { Link } from "@tanstack/react-router";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const links = [
    // { to: "/todos", label: "Todos" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-2">
        <nav className="flex items-center gap-4 text-lg">
          <Link to="/" className="flex items-center gap-1">
            <img
              src="/sightmap_logo.png"
              alt="Sight Map logo"
              className="h-8 w-8 object-contain"
            />
            <h1 className="font-semibold text-md">Sight Map</h1>
          </Link>
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
      <hr />
    </div>
  );
}
