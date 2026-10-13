import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AdminOnly, Actor, CurrentUser, Roles } from './auth';
import { Db, audit } from './db';
import { ListDto, StoreClusterDto, StoreGroupDto, StoreIssueDto, StoreProductDto, StoreStockAdjustmentDto, StoreStockReceiptDto, StoreVendorDto } from './dto';
import { asDate, page } from './utils';
import { jsonSafe, minor } from './fee-utils';

function numberQuantity(value: string) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity === 0 || Math.abs(quantity) > 1000000) throw new BadRequestException('Quantity must be a non-zero whole number within the supported range');
  return quantity;
}

function numberId(prefix: string) { return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`; }

@Controller('store')
export class StoreController {
  constructor(private readonly db: Db) {}

  @Get('summary') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async summary(@CurrentUser() actor: Actor) {
    const [products, openIssues, groups, vendors] = await Promise.all([
      this.db.storeProduct.findMany({ where: { schoolId: actor.schoolId, active: true }, select: { quantity: true, alertQuantity: true } }),
      this.db.storeIssue.findMany({ where: { schoolId: actor.schoolId, status: 'OPEN' }, select: { totalMinor: true, paidMinor: true } }),
      this.db.storeGroup.count({ where: { schoolId: actor.schoolId, active: true } }),
      this.db.storeVendor.count({ where: { schoolId: actor.schoolId, active: true } }),
    ]);
    const lowStock = products.filter(item => item.quantity <= item.alertQuantity).length;
    const outstandingMinor = openIssues.reduce((sum, item) => sum + item.totalMinor - item.paidMinor, 0n);
    return jsonSafe({ productCount: products.length, lowStock, openIssues: openIssues.length, outstandingMinor, groupCount: groups, vendorCount: vendors });
  }

  @Get('groups') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async groups(@CurrentUser() actor: Actor) { return this.db.storeGroup.findMany({ where: { schoolId: actor.schoolId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }); }

  @Post('groups') @AdminOnly()
  async createGroup(@CurrentUser() actor: Actor, @Body() body: StoreGroupDto) {
    return this.db.atomic(async tx => {
      const code = body.code.toUpperCase(); if (await tx.storeGroup.findFirst({ where: { schoolId: actor.schoolId, code } })) throw new ConflictException('Store group code already exists');
      const group = await tx.storeGroup.create({ data: { schoolId: actor.schoolId, code, name: body.name.trim(), description: body.description?.trim() ?? '' } });
      await audit(tx, actor, 'STORE_GROUP_CREATED', 'StoreGroup', group.id, 'Store group created', undefined, group); return group;
    });
  }

  @Get('vendors') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async vendors(@CurrentUser() actor: Actor) { return this.db.storeVendor.findMany({ where: { schoolId: actor.schoolId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }); }

  @Post('vendors') @AdminOnly()
  async createVendor(@CurrentUser() actor: Actor, @Body() body: StoreVendorDto) {
    return this.db.atomic(async tx => {
      if (await tx.storeVendor.findFirst({ where: { schoolId: actor.schoolId, name: body.name.trim() } })) throw new ConflictException('Store vendor already exists');
      const vendor = await tx.storeVendor.create({ data: { schoolId: actor.schoolId, name: body.name.trim(), address: body.address?.trim() ?? '', phone: body.phone?.trim() ?? '', email: body.email?.trim() ?? '', contactName: body.contactName?.trim() ?? '', contactAddress: body.contactAddress?.trim() ?? '', contactPhone: body.contactPhone?.trim() ?? '', bankAccount: body.bankAccount?.trim() ?? '', bankName: body.bankName?.trim() ?? '', ifsc: body.ifsc?.trim().toUpperCase() ?? '', upi: body.upi?.trim() ?? '' } });
      await audit(tx, actor, 'STORE_VENDOR_CREATED', 'StoreVendor', vendor.id, 'Store vendor created', undefined, vendor); return vendor;
    });
  }

  @Get('clusters') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async clusters(@CurrentUser() actor: Actor) {
    const clusters = await this.db.storeCluster.findMany({ where: { schoolId: actor.schoolId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    const lines = await this.db.storeClusterLine.findMany({ where: { schoolId: actor.schoolId, clusterId: { in: clusters.map(cluster => cluster.id) } } });
    const products = await this.db.storeProduct.findMany({ where: { schoolId: actor.schoolId, id: { in: lines.map(line => line.productId) } } });
    return jsonSafe(clusters.map(cluster => ({ ...cluster, items: lines.filter(line => line.clusterId === cluster.id).map(line => ({ ...line, productName: products.find(product => product.id === line.productId)?.name ?? 'Product' })) })));
  }

  @Post('clusters') @AdminOnly()
  async createCluster(@CurrentUser() actor: Actor, @Body() body: StoreClusterDto) {
    return this.db.atomic(async tx => {
      if (await tx.storeCluster.findFirst({ where: { schoolId: actor.schoolId, name: body.name.trim() } })) throw new ConflictException('Store cluster already exists');
      const productIds = [...new Set(body.items.map(item => item.productId))];
      if ((await tx.storeProduct.count({ where: { schoolId: actor.schoolId, id: { in: productIds }, active: true } })) !== productIds.length) throw new BadRequestException('One or more cluster products are invalid');
      const cluster = await tx.storeCluster.create({ data: { schoolId: actor.schoolId, name: body.name.trim() } });
      const items = await Promise.all(body.items.map(item => tx.storeClusterLine.create({ data: { schoolId: actor.schoolId, clusterId: cluster.id, productId: item.productId, quantity: item.quantity } })));
      await audit(tx, actor, 'STORE_CLUSTER_CREATED', 'StoreCluster', cluster.id, 'Store cluster created', undefined, { cluster, items }); return jsonSafe({ ...cluster, items });
    });
  }

  @Get('products') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async products(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const where = { schoolId: actor.schoolId, ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await Promise.all([this.db.storeProduct.findMany({ where, orderBy: [{ active: 'desc' }, { name: 'asc' }], ...page(query.page, query.limit) }), this.db.storeProduct.count({ where })]);
    const groups = await this.db.storeGroup.findMany({ where: { schoolId: actor.schoolId, id: { in: items.flatMap(item => item.groupId ? [item.groupId] : []) } } });
    return jsonSafe({ items: items.map(item => ({ ...item, groupName: groups.find(group => group.id === item.groupId)?.name ?? '' })), total, page: query.page, limit: query.limit });
  }

  @Post('products') @AdminOnly()
  async createProduct(@CurrentUser() actor: Actor, @Body() body: StoreProductDto) {
    const cost = minor(body.unitCostMinor);
    return this.db.atomic(async tx => {
      if (await tx.storeProduct.findFirst({ where: { schoolId: actor.schoolId, name: body.name.trim() } })) throw new ConflictException('Store product already exists');
      if (body.groupId && !await tx.storeGroup.findFirst({ where: { id: body.groupId, schoolId: actor.schoolId, active: true } })) throw new BadRequestException('Store group not found');
      const product = await tx.storeProduct.create({ data: { schoolId: actor.schoolId, name: body.name.trim(), description: body.description?.trim() ?? '', groupId: body.groupId, unitCostMinor: cost, alertQuantity: body.alertQuantity ?? 0 } });
      await audit(tx, actor, 'STORE_PRODUCT_CREATED', 'StoreProduct', product.id, 'Store product created', undefined, product); return jsonSafe(product);
    });
  }

  @Post('stock-receipts') @AdminOnly()
  async receiveStock(@CurrentUser() actor: Actor, @Body() body: StoreStockReceiptDto) {
    const receivedAt = asDate(body.receivedAt);
    return this.db.atomic(async tx => {
      if (body.vendorId && !await tx.storeVendor.findFirst({ where: { id: body.vendorId, schoolId: actor.schoolId, active: true } })) throw new BadRequestException('Store vendor not found');
      const productIds = [...new Set(body.lines.map(line => line.productId))];
      const products = await tx.storeProduct.findMany({ where: { schoolId: actor.schoolId, id: { in: productIds }, active: true } });
      if (products.length !== productIds.length) throw new BadRequestException('One or more store products are invalid or inactive');
      const lines = body.lines.map(line => ({ ...line, unitCost: minor(line.unitCostMinor), total: minor(line.unitCostMinor) * BigInt(line.quantity) }));
      const total = lines.reduce((sum, line) => sum + line.total, 0n);
      const receipt = await tx.storeStockReceipt.create({ data: { schoolId: actor.schoolId, receiptNumber: numberId('SR'), vendorId: body.vendorId, receivedAt, totalMinor: total, reason: body.reason, createdBy: actor.id } });
      for (const line of lines) {
        await tx.storeStockReceiptLine.create({ data: { schoolId: actor.schoolId, receiptId: receipt.id, productId: line.productId, quantity: line.quantity, unitCostMinor: line.unitCost, totalMinor: line.total } });
        await tx.storeProduct.update({ where: { id: line.productId }, data: { quantity: { increment: line.quantity }, unitCostMinor: line.unitCost } });
        await tx.storeStockMovement.create({ data: { schoolId: actor.schoolId, productId: line.productId, type: 'RECEIPT', quantityDelta: line.quantity, unitCostMinor: line.unitCost, sourceType: 'STOCK_RECEIPT', sourceId: receipt.id, reason: body.reason, actorId: actor.id } });
      }
      await audit(tx, actor, 'STORE_STOCK_RECEIVED', 'StoreStockReceipt', receipt.id, body.reason, undefined, { receipt, lines });
      return jsonSafe(receipt);
    });
  }

  @Get('stock-receipts') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async stockReceipts(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const [items, total] = await Promise.all([this.db.storeStockReceipt.findMany({ where: { schoolId: actor.schoolId }, orderBy: { receivedAt: 'desc' }, ...page(query.page, query.limit) }), this.db.storeStockReceipt.count({ where: { schoolId: actor.schoolId } })]);
    const vendors = await this.db.storeVendor.findMany({ where: { schoolId: actor.schoolId, id: { in: items.flatMap(item => item.vendorId ? [item.vendorId] : []) } } });
    return jsonSafe({ items: items.map(item => ({ ...item, vendorName: vendors.find(vendor => vendor.id === item.vendorId)?.name ?? 'Direct purchase' })), total, page: query.page, limit: query.limit });
  }

  @Post('stock-adjustments') @AdminOnly()
  async adjustStock(@CurrentUser() actor: Actor, @Body() body: StoreStockAdjustmentDto) {
    const delta = numberQuantity(body.quantityDelta);
    return this.db.atomic(async tx => {
      const product = await tx.storeProduct.findFirst({ where: { id: body.productId, schoolId: actor.schoolId, active: true } });
      if (!product) throw new BadRequestException('Store product not found');
      if (product.quantity + delta < 0) throw new ConflictException('Stock cannot become negative');
      const updated = await tx.storeProduct.update({ where: { id: product.id }, data: { quantity: { increment: delta } } });
      await tx.storeStockMovement.create({ data: { schoolId: actor.schoolId, productId: product.id, type: 'ADJUSTMENT', quantityDelta: delta, unitCostMinor: product.unitCostMinor, sourceType: 'MANUAL_ADJUSTMENT', sourceId: product.id, reason: body.reason, actorId: actor.id } });
      await audit(tx, actor, 'STORE_STOCK_ADJUSTED', 'StoreProduct', product.id, body.reason, product, updated); return jsonSafe(updated);
    });
  }

  @Get('issues') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async issues(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const studentIds = query.q ? (await this.db.student.findMany({ where: { schoolId: actor.schoolId, OR: [{ admissionNumber: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }] }, select: { id: true } })).map(student => student.id) : undefined;
    const where = { schoolId: actor.schoolId, ...(studentIds ? { studentId: { in: studentIds } } : {}), ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([this.db.storeIssue.findMany({ where, orderBy: { issuedAt: 'desc' }, ...page(query.page, query.limit) }), this.db.storeIssue.count({ where })]);
    const students = await this.db.student.findMany({ where: { schoolId: actor.schoolId, id: { in: items.map(item => item.studentId) } } });
    return jsonSafe({ items: items.map(item => ({ ...item, admissionNumber: students.find(student => student.id === item.studentId)?.admissionNumber ?? '', studentName: students.find(student => student.id === item.studentId)?.name ?? '', outstandingMinor: item.totalMinor - item.paidMinor })), total, page: query.page, limit: query.limit });
  }

  @Get('defaulters') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async defaulters(@CurrentUser() actor: Actor, @Query() query: ListDto) { return this.issues(actor, { ...query, status: 'OPEN' }); }

  @Post('issues') @AdminOnly()
  async issue(@CurrentUser() actor: Actor, @Body() body: StoreIssueDto) {
    const issuedAt = asDate(body.issuedAt);
    return this.db.atomic(async tx => {
      const enrollment = await tx.enrollment.findFirst({ where: { id: body.enrollmentId, studentId: body.studentId, schoolId: actor.schoolId, status: 'ACTIVE' } });
      if (!enrollment) throw new BadRequestException('Active student enrollment not found');
      const productIds = [...new Set(body.lines.map(line => line.productId))];
      const products = await tx.storeProduct.findMany({ where: { schoolId: actor.schoolId, id: { in: productIds }, active: true } });
      if (products.length !== productIds.length) throw new BadRequestException('One or more store products are invalid or inactive');
      const lines = body.lines.map(line => { const product = products.find(item => item.id === line.productId)!; return { ...line, product, total: product.unitCostMinor * BigInt(line.quantity) }; });
      for (const line of lines) if (line.product.quantity < line.quantity) throw new ConflictException(`Insufficient stock for ${line.product.name}`);
      const total = lines.reduce((sum, line) => sum + line.total, 0n);
      const issue = await tx.storeIssue.create({ data: { schoolId: actor.schoolId, issueNumber: numberId('SI'), studentId: body.studentId, enrollmentId: body.enrollmentId, issuedAt, totalMinor: total, reason: body.reason, createdBy: actor.id } });
      for (const line of lines) {
        await tx.storeIssueLine.create({ data: { schoolId: actor.schoolId, issueId: issue.id, productId: line.productId, quantity: line.quantity, unitCostMinor: line.product.unitCostMinor, totalMinor: line.total } });
        await tx.storeProduct.update({ where: { id: line.productId }, data: { quantity: { decrement: line.quantity } } });
        await tx.storeStockMovement.create({ data: { schoolId: actor.schoolId, productId: line.productId, type: 'ISSUE', quantityDelta: -line.quantity, unitCostMinor: line.product.unitCostMinor, sourceType: 'STORE_ISSUE', sourceId: issue.id, reason: body.reason, actorId: actor.id } });
      }
      await audit(tx, actor, 'STORE_ITEM_ISSUED', 'StoreIssue', issue.id, body.reason, undefined, { issue, lines }); return jsonSafe(issue);
    });
  }

  @Post('issues/:id/cancel') @AdminOnly()
  async cancelIssue(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: { reason: string }) {
    if (!body.reason || body.reason.length < 3) throw new BadRequestException('A cancellation reason is required');
    return this.db.atomic(async tx => {
      const issue = await tx.storeIssue.findFirst({ where: { id, schoolId: actor.schoolId, status: 'OPEN' } }); if (!issue) throw new BadRequestException('Open store issue not found');
      if (issue.paidMinor > 0n) throw new ConflictException('A store issue with a payment history cannot be cancelled; reverse the payment first');
      const lines = await tx.storeIssueLine.findMany({ where: { schoolId: actor.schoolId, issueId: id } });
      for (const line of lines) { await tx.storeProduct.update({ where: { id: line.productId }, data: { quantity: { increment: line.quantity } } }); await tx.storeStockMovement.create({ data: { schoolId: actor.schoolId, productId: line.productId, type: 'RETURN', quantityDelta: line.quantity, unitCostMinor: line.unitCostMinor, sourceType: 'STORE_ISSUE_CANCEL', sourceId: issue.id, reason: body.reason, actorId: actor.id } }); }
      const updated = await tx.storeIssue.update({ where: { id }, data: { status: 'VOID' } });
      await audit(tx, actor, 'STORE_ISSUE_CANCELLED', 'StoreIssue', id, body.reason, issue, updated); return jsonSafe(updated);
    });
  }
}
