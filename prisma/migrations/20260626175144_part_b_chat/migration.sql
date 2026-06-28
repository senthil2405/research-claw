-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "claudeSessionId" TEXT,
    "cwd" TEXT,
    "seqCounter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatSession_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "rects" TEXT NOT NULL,
    "selectedText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Highlight_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "highlightId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "highlightText" TEXT,
    "turnIndex" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "Highlight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatSession_documentId_key" ON "ChatSession"("documentId");

-- CreateIndex
CREATE INDEX "Highlight_documentId_createdAt_idx" ON "Highlight"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_seq_idx" ON "ChatMessage"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "ChatMessage_highlightId_turnIndex_idx" ON "ChatMessage"("highlightId", "turnIndex");
