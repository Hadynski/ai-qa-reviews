import { authComponent } from "./auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";

type Role = "admin" | "reviewer" | "user";

const ROLE_HIERARCHY: Record<Role, number> = {
  user: 0,
  reviewer: 1,
  admin: 2,
};

type AuthUser = NonNullable<
  Awaited<ReturnType<typeof authComponent.safeGetAuthUser>>
>;

export async function requireAuth(
  ctx: GenericCtx<DataModel>
): Promise<AuthUser> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}

export async function requireRole(
  ctx: GenericCtx<DataModel>,
  minimumRole: Role
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  const userRole = (user.role as Role) ?? "user";
  if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minimumRole]) {
    throw new Error("Unauthorized");
  }
  return user;
}
