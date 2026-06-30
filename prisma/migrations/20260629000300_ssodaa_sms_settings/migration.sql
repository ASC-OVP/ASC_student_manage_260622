-- AlterTable
ALTER TABLE MessageTemplate ADD COLUMN title TEXT;
ALTER TABLE MessageTemplate ADD COLUMN variables TEXT;
ALTER TABLE MessageTemplate ADD COLUMN isMarketing BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE MessageRecipient ADD COLUMN templateData TEXT;
ALTER TABLE MessageRecipient ADD COLUMN missingVariables TEXT;

-- CreateTable
CREATE TABLE SmsProviderSetting (
    id TEXT NOT NULL PRIMARY KEY,
    academyId TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'SSODAA',
    apiKeyEncrypted TEXT,
    tokenKeyEncrypted TEXT,
    defaultSendPhone TEXT,
    unsubPhone TEXT,
    senderName TEXT,
    testReceiverPhone TEXT,
    isMarketingDefault BOOLEAN NOT NULL DEFAULT false,
    lastConnectionStatus TEXT,
    lastConnectionMessage TEXT,
    lastConnectionCheckedAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL,
    CONSTRAINT SmsProviderSetting_academyId_fkey FOREIGN KEY (academyId) REFERENCES Academy (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX SmsProviderSetting_academyId_provider_key ON SmsProviderSetting(academyId, provider);
CREATE INDEX SmsProviderSetting_academyId_idx ON SmsProviderSetting(academyId);
CREATE INDEX SmsProviderSetting_provider_idx ON SmsProviderSetting(provider);
