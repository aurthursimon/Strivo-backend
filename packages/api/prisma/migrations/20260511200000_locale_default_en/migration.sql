-- Default UI locale updated to English; Arabic is encoded as locale starting with ar.
ALTER TABLE "users" ALTER COLUMN "locale" SET DEFAULT 'en';
