import db from '../lib/db.js';

class CostGuardService {
  constructor() {
    this.userMonthlyPrice = Number(process.env.USER_MONTHLY_PRICE || 20);
    this.infraRatioCap = Number(process.env.INFRA_COST_RATIO_CAP || 0.35);
  }

  getCurrentMonthKey(date = new Date()) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  async getEstimatedRevenue(monthKey = this.getCurrentMonthKey()) {
    // Keep the estimate simple: active subscription users * fixed unit price.
    const [rows] = await db.query(
      `SELECT COUNT(*) AS count
       FROM subscriptions
       WHERE status = 'ACTIVE' AND endDate > NOW()`
    );
    const activeUsers = Number(rows[0]?.count || 0);
    const estimatedRevenue = activeUsers * this.userMonthlyPrice;
    return { monthKey, activeUsers, estimatedRevenue };
  }

  async getCurrentMonthCost(monthKey = this.getCurrentMonthKey()) {
    const [rows] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS totalCost
       FROM cost_ledger
       WHERE billingMonth = ?`,
      [monthKey]
    );
    return Number(rows[0]?.totalCost || 0);
  }

  async getBudgetSnapshot(monthKey = this.getCurrentMonthKey()) {
    const { activeUsers, estimatedRevenue } = await this.getEstimatedRevenue(monthKey);
    const cost = await this.getCurrentMonthCost(monthKey);
    const budget = estimatedRevenue * this.infraRatioCap;
    const remaining = Math.max(0, budget - cost);
    return {
      monthKey,
      activeUsers,
      estimatedRevenue,
      infraRatioCap: this.infraRatioCap,
      budget,
      cost,
      remaining,
    };
  }

  async canReserve(amount, monthKey = this.getCurrentMonthKey()) {
    const snapshot = await this.getBudgetSnapshot(monthKey);
    const allowed = snapshot.remaining >= amount;
    return {
      allowed,
      amount,
      snapshot,
    };
  }

  async addLedgerEntry({
    itemType,
    quantity = 1,
    unitPrice = 0,
    amount = 0,
    currency = 'CNY',
    metadata = null,
    billingMonth = this.getCurrentMonthKey(),
  }) {
    await db.query(
      `INSERT INTO cost_ledger (
         billingMonth, itemType, quantity, unitPrice, amount, currency, metadata, createdAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        billingMonth,
        itemType,
        quantity,
        unitPrice,
        amount,
        currency,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  }
}

export default new CostGuardService();
