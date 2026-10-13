CREATE TABLE "StoreCluster" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreCluster_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoreClusterLine" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "StoreClusterLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreCluster_schoolId_name_key" ON "StoreCluster"("schoolId", "name");
CREATE UNIQUE INDEX "StoreCluster_id_schoolId_key" ON "StoreCluster"("id", "schoolId");
CREATE INDEX "StoreCluster_schoolId_active_idx" ON "StoreCluster"("schoolId", "active");
CREATE UNIQUE INDEX "StoreClusterLine_clusterId_productId_key" ON "StoreClusterLine"("clusterId", "productId");
CREATE INDEX "StoreClusterLine_schoolId_clusterId_idx" ON "StoreClusterLine"("schoolId", "clusterId");
CREATE INDEX "StoreClusterLine_schoolId_productId_idx" ON "StoreClusterLine"("schoolId", "productId");
