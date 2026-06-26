-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'ETC',
    "targetType" TEXT NOT NULL DEFAULT 'GUARDIAN',
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MessageTemplate_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MessageJob_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MessageJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "studentId" TEXT,
    "recipientType" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageRecipient_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MessageJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageRecipient_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "studentId" TEXT,
    "recipientType" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "operationalAllowed" BOOLEAN NOT NULL DEFAULT true,
    "marketingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmsConsent_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SmsConsent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsProviderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "jobId" TEXT,
    "recipientId" TEXT,
    "provider" TEXT NOT NULL,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsProviderLog_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SmsProviderLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MessageJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SmsProviderLog_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "MessageRecipient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MessageTemplate_academyId_category_idx" ON "MessageTemplate"("academyId", "category");

-- CreateIndex
CREATE INDEX "MessageTemplate_academyId_isActive_idx" ON "MessageTemplate"("academyId", "isActive");

-- CreateIndex
CREATE INDEX "MessageTemplate_createdById_idx" ON "MessageTemplate"("createdById");

-- CreateIndex
CREATE INDEX "MessageJob_academyId_createdAt_idx" ON "MessageJob"("academyId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageJob_academyId_status_idx" ON "MessageJob"("academyId", "status");

-- CreateIndex
CREATE INDEX "MessageJob_templateId_idx" ON "MessageJob"("templateId");

-- CreateIndex
CREATE INDEX "MessageJob_createdById_idx" ON "MessageJob"("createdById");

-- CreateIndex
CREATE INDEX "MessageRecipient_jobId_idx" ON "MessageRecipient"("jobId");

-- CreateIndex
CREATE INDEX "MessageRecipient_studentId_idx" ON "MessageRecipient"("studentId");

-- CreateIndex
CREATE INDEX "MessageRecipient_recipientType_idx" ON "MessageRecipient"("recipientType");

-- CreateIndex
CREATE INDEX "MessageRecipient_normalizedPhone_idx" ON "MessageRecipient"("normalizedPhone");

-- CreateIndex
CREATE INDEX "MessageRecipient_status_idx" ON "MessageRecipient"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConsent_academyId_recipientType_normalizedPhone_key" ON "SmsConsent"("academyId", "recipientType", "normalizedPhone");

-- CreateIndex
CREATE INDEX "SmsConsent_academyId_studentId_idx" ON "SmsConsent"("academyId", "studentId");

-- CreateIndex
CREATE INDEX "SmsConsent_normalizedPhone_idx" ON "SmsConsent"("normalizedPhone");

-- CreateIndex
CREATE INDEX "SmsProviderLog_academyId_createdAt_idx" ON "SmsProviderLog"("academyId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsProviderLog_jobId_idx" ON "SmsProviderLog"("jobId");

-- CreateIndex
CREATE INDEX "SmsProviderLog_recipientId_idx" ON "SmsProviderLog"("recipientId");

-- CreateIndex
CREATE INDEX "SmsProviderLog_provider_idx" ON "SmsProviderLog"("provider");

-- CreateIndex
CREATE INDEX "SmsProviderLog_status_idx" ON "SmsProviderLog"("status");
