import { betterAuth } from "better-auth";
import { bearer, jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "./db/index.js";
import { env } from "./env.js";

// Identificador del recurso protegido: debe ser la URL pública exacta del endpoint MCP.
export const MCP_RESOURCE = `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/mcp`;

// Login de la app con email + contraseña. El plugin `bearer` mantiene compatibilidad
// con clientes Bearer simples, y `mcp` expone OAuth 2.1 + descubrimiento para
// ChatGPT y Claude Desktop (DCR + CIMD).
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
      jwks: schema.jwks,
      oauthClient: schema.oauthClient,
      oauthResource: schema.oauthResource,
      oauthClientResource: schema.oauthClientResource,
      oauthRefreshToken: schema.oauthRefreshToken,
      oauthAccessToken: schema.oauthAccessToken,
      oauthConsent: schema.oauthConsent,
      oauthClientAssertion: schema.oauthClientAssertion,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    bearer(),
    jwt(),
    mcp({
      loginPage: "/sign-in",
      consentPage: "/consent",
      resource: MCP_RESOURCE,
      // ChatGPT y Claude Desktop se registran solos al conectar.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
  trustedOrigins: [env.FRONTEND_URL],
});

export type AppSession = typeof auth.$Infer.Session;
