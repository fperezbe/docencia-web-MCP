import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { db, schema } from "./db/index.js";
import { env } from "./env.js";

// Login de la app con email + contraseña. El plugin `bearer` permite que los
// clientes MCP se autentiquen con `Authorization: Bearer <token>` en vez de cookies.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [bearer()],
  trustedOrigins: [env.FRONTEND_URL],
});

export type AppSession = typeof auth.$Infer.Session;
