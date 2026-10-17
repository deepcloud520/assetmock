-- CreateTable
CREATE TABLE "MarketInstrument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MarketCalendar" (
    "day" TEXT NOT NULL PRIMARY KEY,
    "isOpen" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "verifiedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MarketDailyState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instrumentId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eventCoverage" BOOLEAN NOT NULL DEFAULT false,
    "lowerMinor" BIGINT NOT NULL,
    "upperMinor" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "verifiedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketDailyState_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instrumentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceAt" DATETIME NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "previousMinor" BIGINT NOT NULL,
    "bidMinor" BIGINT NOT NULL,
    "askMinor" BIGINT NOT NULL,
    "bidQuantity" INTEGER NOT NULL,
    "askQuantity" INTEGER NOT NULL,
    "lowerMinor" BIGINT NOT NULL,
    "upperMinor" BIGINT NOT NULL,
    CONSTRAINT "MarketQuote_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperRuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MarketReviewRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PaperAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "initialMinor" BIGINT NOT NULL,
    "cashMinor" BIGINT NOT NULL,
    "frozenMinor" BIGINT NOT NULL DEFAULT 0,
    "realizedMinor" BIGINT NOT NULL DEFAULT 0,
    "feesMinor" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "ruleId" TEXT NOT NULL,
    "health" TEXT NOT NULL DEFAULT 'OK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    CONSTRAINT "PaperAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperAccount_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PaperRuleVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "limitMinor" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "filled" INTEGER NOT NULL DEFAULT 0,
    "turnoverMinor" BIGINT NOT NULL DEFAULT 0,
    "feesMinor" BIGINT NOT NULL DEFAULT 0,
    "frozenMinor" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "day" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperOrder_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperOrder_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaperOrder_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PaperRuleVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperOrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperOrderEvent_workspaceId_accountId_orderId_fkey" FOREIGN KEY ("workspaceId", "accountId", "orderId") REFERENCES "PaperOrder" ("workspaceId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperFill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "costMinor" BIGINT NOT NULL,
    "realizedMinor" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperFill_workspaceId_accountId_orderId_fkey" FOREIGN KEY ("workspaceId", "accountId", "orderId") REFERENCES "PaperOrder" ("workspaceId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperFill_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "MarketQuote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "frozen" INTEGER NOT NULL DEFAULT 0,
    "costMinor" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "PaperPosition_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperPosition_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperPositionLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sellableOn" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperPositionLot_workspaceId_accountId_positionId_fkey" FOREIGN KEY ("workspaceId", "accountId", "positionId") REFERENCES "PaperPosition" ("workspaceId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperCashEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "balanceMinor" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperCashEntry_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperPreview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "epoch" INTEGER NOT NULL,
    "inputJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperPreview_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    CONSTRAINT "PaperRequest_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperQuoteConsumption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "PaperQuoteConsumption_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaperAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperQuoteConsumption_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "MarketQuote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperWatchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    CONSTRAINT "PaperWatchlist_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperWatchlist_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperEquitySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cashMinor" BIGINT NOT NULL,
    "marketMinor" BIGINT,
    "equityMinor" BIGINT,
    "quality" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperEquitySnapshot_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperReviewNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperReviewNote_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cashMinor" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperAdjustment_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperWorkerLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "token" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "heartbeatAt" DATETIME NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "error" TEXT NOT NULL DEFAULT ''
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketDailyState_instrumentId_day_key" ON "MarketDailyState"("instrumentId", "day");

-- CreateIndex
CREATE INDEX "MarketQuote_instrumentId_sourceAt_idx" ON "MarketQuote"("instrumentId", "sourceAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaperAccount_workspaceId_id_key" ON "PaperAccount"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "PaperOrder_status_day_idx" ON "PaperOrder"("status", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PaperOrder_workspaceId_accountId_id_key" ON "PaperOrder"("workspaceId", "accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperFill_orderId_quoteId_key" ON "PaperFill"("orderId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperPosition_accountId_instrumentId_key" ON "PaperPosition"("accountId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperPosition_workspaceId_accountId_id_key" ON "PaperPosition"("workspaceId", "accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperCashEntry_eventKey_key" ON "PaperCashEntry"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaperRequest_workspaceId_key_key" ON "PaperRequest"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PaperQuoteConsumption_accountId_quoteId_side_key" ON "PaperQuoteConsumption"("accountId", "quoteId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "PaperWatchlist_accountId_instrumentId_key" ON "PaperWatchlist"("accountId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperEquitySnapshot_accountId_key_key" ON "PaperEquitySnapshot"("accountId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PaperAdjustment_accountId_eventKey_key" ON "PaperAdjustment"("accountId", "eventKey");


-- Database backstops for simulated trading; real balances remain untouched.
CREATE UNIQUE INDEX PaperAccount_one_active ON PaperAccount(workspaceId) WHERE status = 'ACTIVE';
CREATE TRIGGER PaperAccount_check_insert BEFORE INSERT ON PaperAccount WHEN NEW.cashMinor < 0 OR NEW.frozenMinor < 0 OR NEW.initialMinor <= 0 OR NEW.status NOT IN ('ACTIVE','ARCHIVED') BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperAccount_check_update BEFORE UPDATE ON PaperAccount WHEN NEW.cashMinor < 0 OR NEW.frozenMinor < 0 OR NEW.initialMinor <= 0 OR NEW.status NOT IN ('ACTIVE','ARCHIVED') BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperPosition_check_insert BEFORE INSERT ON PaperPosition WHEN NEW.quantity < 0 OR NEW.frozen < 0 OR NEW.frozen > NEW.quantity OR NEW.costMinor < 0 BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperPosition_check_update BEFORE UPDATE ON PaperPosition WHEN NEW.quantity < 0 OR NEW.frozen < 0 OR NEW.frozen > NEW.quantity OR NEW.costMinor < 0 BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperOrder_check_insert BEFORE INSERT ON PaperOrder WHEN NEW.quantity <= 0 OR NEW.filled < 0 OR NEW.filled > NEW.quantity OR NEW.limitMinor <= 0 OR NEW.frozenMinor < 0 OR NEW.side NOT IN ('BUY','SELL') OR NEW.status NOT IN ('OPEN','PARTIALLY_FILLED','FILLED','CANCELLED','EXPIRED','REJECTED') BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperOrder_check_update BEFORE UPDATE ON PaperOrder WHEN NEW.quantity <= 0 OR NEW.filled < 0 OR NEW.filled > NEW.quantity OR NEW.limitMinor <= 0 OR NEW.frozenMinor < 0 OR NEW.side NOT IN ('BUY','SELL') OR NEW.status NOT IN ('OPEN','PARTIALLY_FILLED','FILLED','CANCELLED','EXPIRED','REJECTED') BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperPositionLot_check_insert BEFORE INSERT ON PaperPositionLot WHEN NEW.quantity < 0 BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperPositionLot_check_update BEFORE UPDATE ON PaperPositionLot WHEN NEW.quantity < 0 BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperFill_check_insert BEFORE INSERT ON PaperFill WHEN NEW.quantity <= 0 OR NEW.priceMinor <= 0 OR NEW.feeMinor < 0 BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperFill_check_update BEFORE UPDATE ON PaperFill WHEN NEW.quantity <= 0 OR NEW.priceMinor <= 0 OR NEW.feeMinor < 0 BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperQuoteConsumption_check_insert BEFORE INSERT ON PaperQuoteConsumption WHEN NEW.quantity < 0 BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperQuoteConsumption_check_update BEFORE UPDATE ON PaperQuoteConsumption WHEN NEW.quantity < 0 BEGIN SELECT RAISE(ABORT, 'invalid simulated ledger value'); END;
CREATE TRIGGER PaperRuleVersion_immutable BEFORE UPDATE ON PaperRuleVersion BEGIN SELECT RAISE(ABORT, 'immutable trading evidence'); END;
CREATE TRIGGER PaperFill_immutable BEFORE UPDATE ON PaperFill BEGIN SELECT RAISE(ABORT, 'immutable trading evidence'); END;
CREATE TRIGGER PaperCashEntry_immutable BEFORE UPDATE ON PaperCashEntry BEGIN SELECT RAISE(ABORT, 'immutable trading evidence'); END;
CREATE TRIGGER PaperOrderEvent_immutable BEFORE UPDATE ON PaperOrderEvent BEGIN SELECT RAISE(ABORT, 'immutable trading evidence'); END;
CREATE TRIGGER PaperAdjustment_immutable BEFORE UPDATE ON PaperAdjustment BEGIN SELECT RAISE(ABORT, 'immutable trading evidence'); END;
CREATE TRIGGER MarketReviewRecord_immutable BEFORE UPDATE ON MarketReviewRecord BEGIN SELECT RAISE(ABORT, 'immutable trading evidence'); END;
CREATE TRIGGER MarketQuote_immutable BEFORE UPDATE ON MarketQuote BEGIN SELECT RAISE(ABORT, 'immutable trading evidence'); END;
CREATE TRIGGER PaperFill_quote_instrument BEFORE INSERT ON PaperFill WHEN (SELECT instrumentId FROM PaperOrder WHERE id=NEW.orderId) != (SELECT instrumentId FROM MarketQuote WHERE id=NEW.quoteId) BEGIN SELECT RAISE(ABORT, 'quote instrument mismatch'); END;
