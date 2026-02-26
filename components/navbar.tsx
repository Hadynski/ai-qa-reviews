"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { authClient } from "@/lib/auth-client";

const publicNavItems = [
  { href: "/", label: "Pipeline" },
  { href: "/agents", label: "Agents" },
];

const adminNavItems = [
  { href: "/admin/question-groups", label: "Question Groups" },
  { href: "/admin/statuses", label: "Statuses" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Settings" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  reviewer: "bg-blue-100 text-blue-800",
  user: "bg-gray-100 text-gray-800",
};

export function Navbar() {
  const pathname = usePathname();
  const { user, isLoading, isAdmin, role } = useCurrentUser();

  const navItems = isAdmin
    ? [...publicNavItems, ...adminNavItems]
    : publicNavItems;

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
      },
    });
  }

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center px-4">
        <nav className="flex gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href))
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {!isLoading && user && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {user.name || user.email}
            </span>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                ROLE_COLORS[role] ?? ROLE_COLORS.user
              )}
            >
              {role}
            </span>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
