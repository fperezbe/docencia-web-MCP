import "dotenv/config";

function requerido(nombre: string, defecto?: string): string {
  const valor = process.env[nombre] ?? defecto;
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre} (ver .env.example).`);
  }
  return valor;
}

export const env = {
  DATABASE_URL: requerido("DATABASE_URL"),
  BETTER_AUTH_SECRET: requerido("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: requerido("BETTER_AUTH_URL", "http://localhost:3000"),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:5173",
  ENCRYPTION_KEY: requerido("ENCRYPTION_KEY"),
  PORT: Number(process.env.PORT ?? 3000),
  HOST: process.env.HOST ?? "127.0.0.1",
};
