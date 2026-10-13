-- Transport operational masters and store inventory/issue management.

ALTER TABLE "ServiceAssignment" ADD COLUMN "routeId" TEXT;
ALTER TABLE "ServiceAssignment" ADD COLUMN "vehicleId" TEXT;

CREATE TABLE "TransportRoute" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campus" TEXT NOT NULL DEFAULT '',
    "destination" TEXT NOT NULL DEFAULT '',
    "monthlyAmountMinor" BIGINT NOT NULL,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TransportVehicle" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "busNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "driver1Name" TEXT NOT NULL DEFAULT '',
    "driver1Phone" TEXT NOT NULL DEFAULT '',
    "driver2Name" TEXT NOT NULL DEFAULT '',
    "driver2Phone" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransportVehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreGroup" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoreVendor" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactAddress" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "bankAccount" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "ifsc" TEXT NOT NULL DEFAULT '',
    "upi" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreVendor_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoreProduct" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT,
    "unitCostMinor" BIGINT NOT NULL,
    "alertQuantity" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoreStockReceipt" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "vendorId" TEXT,
    "receivedAt" DATE NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreStockReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoreStockReceiptLine" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    CONSTRAINT "StoreStockReceiptLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoreStockMovement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "unitCostMinor" BIGINT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreStockMovement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoreIssue" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "issueNumber" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "issuedAt" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "totalMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreIssue_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoreIssueLine" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    CONSTRAINT "StoreIssueLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportRoute_schoolId_name_key" ON "TransportRoute"("schoolId", "name");
CREATE UNIQUE INDEX "TransportRoute_id_schoolId_key" ON "TransportRoute"("id", "schoolId");
CREATE INDEX "TransportRoute_schoolId_active_idx" ON "TransportRoute"("schoolId", "active");
CREATE UNIQUE INDEX "TransportVehicle_schoolId_busNumber_key" ON "TransportVehicle"("schoolId", "busNumber");
CREATE UNIQUE INDEX "TransportVehicle_id_schoolId_key" ON "TransportVehicle"("id", "schoolId");
CREATE INDEX "TransportVehicle_schoolId_active_idx" ON "TransportVehicle"("schoolId", "active");
CREATE UNIQUE INDEX "StoreGroup_schoolId_code_key" ON "StoreGroup"("schoolId", "code");
CREATE UNIQUE INDEX "StoreGroup_id_schoolId_key" ON "StoreGroup"("id", "schoolId");
CREATE INDEX "StoreGroup_schoolId_active_idx" ON "StoreGroup"("schoolId", "active");
CREATE UNIQUE INDEX "StoreVendor_schoolId_name_key" ON "StoreVendor"("schoolId", "name");
CREATE UNIQUE INDEX "StoreVendor_id_schoolId_key" ON "StoreVendor"("id", "schoolId");
CREATE INDEX "StoreVendor_schoolId_active_idx" ON "StoreVendor"("schoolId", "active");
CREATE UNIQUE INDEX "StoreProduct_schoolId_name_key" ON "StoreProduct"("schoolId", "name");
CREATE UNIQUE INDEX "StoreProduct_id_schoolId_key" ON "StoreProduct"("id", "schoolId");
CREATE INDEX "StoreProduct_schoolId_active_quantity_idx" ON "StoreProduct"("schoolId", "active", "quantity");
CREATE INDEX "StoreProduct_schoolId_groupId_idx" ON "StoreProduct"("schoolId", "groupId");
CREATE UNIQUE INDEX "StoreStockReceipt_schoolId_receiptNumber_key" ON "StoreStockReceipt"("schoolId", "receiptNumber");
CREATE UNIQUE INDEX "StoreStockReceipt_id_schoolId_key" ON "StoreStockReceipt"("id", "schoolId");
CREATE INDEX "StoreStockReceipt_schoolId_receivedAt_idx" ON "StoreStockReceipt"("schoolId", "receivedAt");
CREATE INDEX "StoreStockReceiptLine_schoolId_receiptId_idx" ON "StoreStockReceiptLine"("schoolId", "receiptId");
CREATE INDEX "StoreStockReceiptLine_schoolId_productId_idx" ON "StoreStockReceiptLine"("schoolId", "productId");
CREATE INDEX "StoreStockMovement_schoolId_productId_createdAt_idx" ON "StoreStockMovement"("schoolId", "productId", "createdAt");
CREATE INDEX "StoreStockMovement_schoolId_sourceType_sourceId_idx" ON "StoreStockMovement"("schoolId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "StoreIssue_schoolId_issueNumber_key" ON "StoreIssue"("schoolId", "issueNumber");
CREATE UNIQUE INDEX "StoreIssue_id_schoolId_key" ON "StoreIssue"("id", "schoolId");
CREATE INDEX "StoreIssue_schoolId_studentId_issuedAt_idx" ON "StoreIssue"("schoolId", "studentId", "issuedAt");
CREATE INDEX "StoreIssue_schoolId_status_issuedAt_idx" ON "StoreIssue"("schoolId", "status", "issuedAt");
CREATE INDEX "StoreIssueLine_schoolId_issueId_idx" ON "StoreIssueLine"("schoolId", "issueId");
CREATE INDEX "StoreIssueLine_schoolId_productId_idx" ON "StoreIssueLine"("schoolId", "productId");
CREATE INDEX "ServiceAssignment_schoolId_routeId_startDate_endDate_idx" ON "ServiceAssignment"("schoolId", "routeId", "startDate", "endDate");
CREATE INDEX "ServiceAssignment_schoolId_vehicleId_startDate_endDate_idx" ON "ServiceAssignment"("schoolId", "vehicleId", "startDate", "endDate");
