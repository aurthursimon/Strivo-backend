-- CreateEnum
CREATE TYPE "SupportChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "support_chat_conversations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_chat_messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" "SupportChatRole" NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_chat_conversations_userId_updatedAt_idx"
ON "support_chat_conversations" ("userId", "updatedAt");

CREATE INDEX "support_chat_messages_conversationId_createdAt_idx"
ON "support_chat_messages" ("conversationId", "createdAt");

ALTER TABLE "support_chat_conversations"
ADD CONSTRAINT "support_chat_conversations_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_chat_messages"
ADD CONSTRAINT "support_chat_messages_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "support_chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
