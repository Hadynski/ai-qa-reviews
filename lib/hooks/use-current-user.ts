import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type Role = "admin" | "reviewer" | "user";

const ROLE_HIERARCHY: Record<Role, number> = {
  user: 0,
  reviewer: 1,
  admin: 2,
};

export function useCurrentUser() {
  const user = useQuery(api.auth.getCurrentUser);
  const isLoading = user === undefined;
  const isAuthenticated = user !== null && user !== undefined;
  const role = (user?.role as Role) ?? "user";

  return {
    user,
    isLoading,
    isAuthenticated,
    role,
    isAdmin: role === "admin",
    isReviewer: ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.reviewer,
  };
}
