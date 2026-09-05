/**
 * Fails fast at boot if the environment is incomplete. A missing JWT
 * secret should stop the process, not surface as a 500 on first login.
 */
export function envValidationSchema(config: Record<string, unknown>) {
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  for (const secret of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (String(config[secret]).length < 32) {
      throw new Error(`${secret} must be at least 32 characters`);
    }
  }

  return {
    ...config,
    PORT: Number(config.PORT ?? 4000),
    NODE_ENV: config.NODE_ENV ?? 'development',
    JWT_ACCESS_TTL: config.JWT_ACCESS_TTL ?? '15m',
    JWT_REFRESH_TTL: config.JWT_REFRESH_TTL ?? '7d',
  };
}
