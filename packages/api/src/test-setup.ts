/**
 * Setup hermetico de testes. Define variaveis de ambiente seguras ANTES de
 * qualquer modulo carregar config (que valida via Zod e chama process.exit em
 * caso invalido). dotenv nao sobrescreve vars ja definidas, entao estes valores
 * tornam os testes independentes do .env local.
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0001',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret-001',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// VAPID_SUBJECT deve ser email valido quando presente; forca um valor seguro em
// teste para nao depender do .env local.
process.env.VAPID_SUBJECT = 'mailto-test@example.com';
