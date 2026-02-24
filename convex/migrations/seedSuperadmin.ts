"use node";

import { internalAction } from "../_generated/server";
import { createAuth } from "../auth";

const SUPERADMIN_EMAIL = "j.markiewicz@letsautomate.pl";
const SUPERADMIN_NAME = "Jakub Markiewicz";

export const seed = internalAction({
  args: {},
  handler: async (ctx) => {
    const password = process.env.SUPERADMIN_PASSWORD;
    if (!password) {
      throw new Error(
        "SUPERADMIN_PASSWORD env var is required. Set it in the Convex dashboard before running this migration."
      );
    }

    const auth = createAuth(ctx);

    let userId: string;
    try {
      const { user } = await auth.api.signUpEmail({
        body: {
          email: SUPERADMIN_EMAIL,
          password,
          name: SUPERADMIN_NAME,
        },
      });
      userId = user.id;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : JSON.stringify(err);
      if (
        message.includes("already exists") ||
        message.includes("UNIQUE constraint")
      ) {
        console.log(
          `Superadmin ${SUPERADMIN_EMAIL} already exists, skipping seed`
        );
        return { seeded: false, email: SUPERADMIN_EMAIL };
      }
      console.error("signUpEmail failed:", message);
      throw err;
    }

    const authCtx = await auth.$context;
    await authCtx.internalAdapter.updateUser(userId, { role: "admin" });

    console.log(`Superadmin ${SUPERADMIN_EMAIL} created with admin role`);
    return { seeded: true, email: SUPERADMIN_EMAIL, userId };
  },
});
