ALTER TABLE "User"
ADD COLUMN "email" TEXT,
ADD COLUMN "emailPromptSeen" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "emailPromptSeen" = true;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
