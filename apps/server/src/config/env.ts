import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  cookieName: process.env.COOKIE_NAME ?? "kho_token",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
