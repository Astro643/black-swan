import { Pool, PoolClient, PoolConfig } from 'pg';
import { DATABASE_URL, POOL_CONFIG } from '../config';
import {
  UserProfileRow,
  UserProfileInsert,
  UserProfileUpdate,
  StockRow,
  StockInsert,
  StockUpdate,
  PortfolioRow,
  PortfolioInsert,
  PortfolioUpdate,
  TransactionRow,
  TransactionInsert,
  ShopItemRow,
  ShopItemInsert,
  InventoryRow,
  InventoryInsert,
  InventoryUpdate,
  MarketEventRow,
  MarketEventInsert,
  LoanRow,
  LoanInsert,
  LoanUpdate,
  NotificationRow,
  NotificationInsert,
  ManipulationQueueRow,
  ManipulationQueueInsert,
  ManipulationQueueUpdate,
} from './types';

// ============================================
// POOL INSTANCE
// ============================================

const poolConfig: PoolConfig = {
  connectionString: DATABASE_URL,
  ...POOL_CONFIG,
  ssl: DATABASE_URL.includes('supabase') || DATABASE_URL.includes('sslmode') ? { rejectUnauthorized: false } : undefined,
};

export const pool = new Pool(poolConfig);

// Graceful shutdown
export const closePool = async (): Promise<void> => {
  await pool.end();
};

// Test connection
export const testConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
};

// ============================================
// QUERY HELPERS
// ============================================

export const query = async <T>(text: string, params?: unknown[]): Promise<T[]> => {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
    }
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  return pool.connect();
};

export const executeTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// USER PROFILE QUERIES
// ============================================

export const userProfileQueries = {
  getByDiscordId: async (discordId: string): Promise<UserProfileRow | null> => {
    const rows = await query<UserProfileRow>(
      `SELECT * FROM user_profiles WHERE discord_id = $1`,
      [discordId]
    );
    return rows[0] || null;
  },

  getById: async (id: string): Promise<UserProfileRow | null> => {
    const rows = await query<UserProfileRow>(
      `SELECT * FROM user_profiles WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  create: async (data: UserProfileInsert): Promise<UserProfileRow> => {
    const rows = await query<UserProfileRow>(
      `INSERT INTO user_profiles (discord_id, username, discriminator, avatar, cash, net_worth, loan_amount, loan_taken_at, last_interest_at, loan_payments_missed, total_earnings, total_spent, cosmetic_ids, has_analyst_pass, is_liquidated, last_tax_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
       RETURNING *`,
      [
        data.discord_id,
        data.username,
        data.discriminator,
        data.avatar,
        data.cash ?? 1000,
        data.net_worth ?? 1000,
        data.loan_amount ?? 0,
        data.loan_taken_at,
        data.last_interest_at,
        data.loan_payments_missed ?? 0,
        data.total_earnings ?? 0,
        data.total_spent ?? 0,
        data.cosmetic_ids ?? [],
        data.has_analyst_pass ?? false,
        data.is_liquidated ?? false,
        data.last_tax_at,
      ]
    );
    return rows[0];
  },

  update: async (id: string, data: UserProfileUpdate): Promise<UserProfileRow | null> => {
    const fields = Object.keys(data).map((key, idx) => `${key} = $${idx + 1}`);
    const values = Object.values(data);
    values.push(id);
    
    const rows = await query<UserProfileRow>(
      `UPDATE user_profiles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  updateCash: async (id: string, amount: number, reason: string): Promise<UserProfileRow | null> => {
    const rows = await query<UserProfileRow>(
      `UPDATE user_profiles SET cash = cash + $1, net_worth = net_worth + $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [amount, id]
    );
    return rows[0] || null;
  },

  getAll: async (): Promise<UserProfileRow[]> => {
    return query<UserProfileRow>(`SELECT * FROM user_profiles ORDER BY net_worth DESC`);
  },

  getLeaderboard: async (limit: number = 10): Promise<UserProfileRow[]> => {
    return query<UserProfileRow>(
      `SELECT * FROM user_profiles ORDER BY net_worth DESC LIMIT $1`,
      [limit]
    );
  },
};

// ============================================
// STOCK QUERIES
// ============================================

export const stockQueries = {
  getByTicker: async (ticker: string): Promise<StockRow | null> => {
    const rows = await query<StockRow>(
      `SELECT * FROM stocks WHERE ticker = $1`,
      [ticker]
    );
    return rows[0] || null;
  },

  getById: async (id: string): Promise<StockRow | null> => {
    const rows = await query<StockRow>(
      `SELECT * FROM stocks WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  getAllActive: async (): Promise<StockRow[]> => {
    return query<StockRow>(`SELECT * FROM stocks WHERE is_active = true ORDER BY ticker`);
  },

  getByCategory: async (category: 'TECH' | 'MEME' | 'SAFE_HAVEN'): Promise<StockRow[]> => {
    return query<StockRow>(
      `SELECT * FROM stocks WHERE category = $1 AND is_active = true ORDER BY ticker`,
      [category]
    );
  },

  update: async (id: string, data: StockUpdate): Promise<StockRow | null> => {
    const fields = Object.keys(data).map((key, idx) => `${key} = $${idx + 1}`);
    const values = Object.values(data);
    values.push(id);
    
    const rows = await query<StockRow>(
      `UPDATE stocks SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  updatePrice: async (id: string, newPrice: number): Promise<StockRow | null> => {
    const rows = await query<StockRow>(
      `UPDATE stocks SET current_price = $1, last_price_update = NOW() WHERE id = $2 RETURNING *`,
      [newPrice, id]
    );
    return rows[0] || null;
  },

  updateManipulation: async (
    id: string,
    isManipulated: boolean,
    manipulatedBy: string | null,
    manipulatedType: 'PUMP' | 'DUMP' | null,
    manipulatedAt: Date | null
  ): Promise<StockRow | null> => {
    const rows = await query<StockRow>(
      `UPDATE stocks SET is_manipulated = $1, manipulated_by = $2, manipulated_type = $3, manipulated_at = $4 WHERE id = $5 RETURNING *`,
      [isManipulated, manipulatedBy, manipulatedType, manipulatedAt, id]
    );
    return rows[0] || null;
  },

  batchUpdatePrices: async (updates: { id: string; newPrice: number }[]): Promise<void> => {
    if (updates.length === 0) return;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const update of updates) {
        await client.query(
          `UPDATE stocks SET current_price = $1, last_price_update = NOW() WHERE id = $2`,
          [update.newPrice, update.id]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

// ============================================
// PORTFOLIO QUERIES
// ============================================

export const portfolioQueries = {
  getByUserId: async (userId: string): Promise<PortfolioRow[]> => {
    return query<PortfolioRow>(
      `SELECT * FROM portfolios WHERE user_id = $1 ORDER BY ticker`,
      [userId]
    );
  },

  getByUserIdAndTicker: async (userId: string, ticker: string): Promise<PortfolioRow | null> => {
    const rows = await query<PortfolioRow>(
      `SELECT * FROM portfolios WHERE user_id = $1 AND ticker = $2`,
      [userId, ticker]
    );
    return rows[0] || null;
  },

  getById: async (id: string): Promise<PortfolioRow | null> => {
    const rows = await query<PortfolioRow>(
      `SELECT * FROM portfolios WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  create: async (data: PortfolioInsert): Promise<PortfolioRow> => {
    const rows = await query<PortfolioRow>(
      `INSERT INTO portfolios (user_id, stock_id, ticker, shares, average_price, total_invested, stop_loss_price, stop_loss_contract_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        data.user_id,
        data.stock_id,
        data.ticker,
        data.shares,
        data.average_price,
        data.total_invested,
        data.stop_loss_price ?? null,
        data.stop_loss_contract_id ?? null,
      ]
    );
    return rows[0];
  },

  update: async (id: string, data: PortfolioUpdate): Promise<PortfolioRow | null> => {
    const fields = Object.keys(data).map((key, idx) => `${key} = $${idx + 1}`);
    const values = Object.values(data);
    values.push(id);
    
    const rows = await query<PortfolioRow>(
      `UPDATE portfolios SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  updateShares: async (id: string, shares: number): Promise<PortfolioRow | null> => {
    const rows = await query<PortfolioRow>(
      `UPDATE portfolios SET shares = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [shares, id]
    );
    return rows[0] || null;
  },

  delete: async (id: string): Promise<PortfolioRow | null> => {
    const rows = await query<PortfolioRow>(
      `DELETE FROM portfolios WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  deleteByUserIdAndTicker: async (userId: string, ticker: string): Promise<PortfolioRow | null> => {
    const rows = await query<PortfolioRow>(
      `DELETE FROM portfolios WHERE user_id = $1 AND ticker = $2 RETURNING *`,
      [userId, ticker]
    );
    return rows[0] || null;
  },

  getTotalValue: async (userId: string): Promise<number> => {
    const stocks = await stockQueries.getAllActive();
    const portfolio = await portfolioQueries.getByUserId(userId);
    
    let totalValue = 0;
    for (const position of portfolio) {
      const stock = stocks.find(s => s.ticker === position.ticker);
      if (stock) {
        totalValue += position.shares * stock.current_price;
      }
    }
    return totalValue;
  },
};

// ============================================
// TRANSACTION QUERIES
// ============================================

export const transactionQueries = {
  create: async (data: TransactionInsert): Promise<TransactionRow> => {
    const rows = await query<TransactionRow>(
      `INSERT INTO transactions (user_id, transaction_type, ticker, shares, price, amount, fee, balance_after, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        data.user_id,
        data.transaction_type,
        data.ticker ?? null,
        data.shares ?? null,
        data.price ?? null,
        data.amount,
        data.fee ?? 0,
        data.balance_after,
        data.metadata ?? null,
      ]
    );
    return rows[0];
  },

  getByUserId: async (userId: string, limit: number = 50): Promise<TransactionRow[]> => {
    return query<TransactionRow>(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
  },

  getRecentWhaleTransactions: async (threshold: number = 500000): Promise<TransactionRow[]> => {
    return query<TransactionRow>(
      `SELECT t.*, u.username, u.discriminator 
       FROM transactions t 
       JOIN user_profiles u ON t.user_id = u.id 
       WHERE t.amount >= $1 
       ORDER BY t.created_at DESC 
       LIMIT 100`,
      [threshold]
    );
  },

  getRecentByType: async (transactionType: string, limit: number = 100): Promise<TransactionRow[]> => {
    return query<TransactionRow>(
      `SELECT * FROM transactions WHERE transaction_type = $1 ORDER BY created_at DESC LIMIT $2`,
      [transactionType, limit]
    );
  },
};

// ============================================
// SHOP ITEM QUERIES
// ============================================

export const shopItemQueries = {
  getByItemId: async (itemId: string): Promise<ShopItemRow | null> => {
    const rows = await query<ShopItemRow>(
      `SELECT * FROM shop_items WHERE item_id = $1`,
      [itemId]
    );
    return rows[0] || null;
  },

  getById: async (id: string): Promise<ShopItemRow | null> => {
    const rows = await query<ShopItemRow>(
      `SELECT * FROM shop_items WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  getAllActive: async (): Promise<ShopItemRow[]> => {
    return query<ShopItemRow>(`SELECT * FROM shop_items WHERE is_active = true ORDER BY category, name`);
  },

  getByCategory: async (category: string): Promise<ShopItemRow[]> => {
    return query<ShopItemRow>(
      `SELECT * FROM shop_items WHERE category = $1 AND is_active = true ORDER BY name`,
      [category]
    );
  },
};

// ============================================
// INVENTORY QUERIES
// ============================================

export const inventoryQueries = {
  getByUserId: async (userId: string): Promise<InventoryRow[]> => {
    return query<InventoryRow>(
      `SELECT * FROM inventories WHERE user_id = $1 ORDER BY item_id`,
      [userId]
    );
  },

  getByUserIdAndItemId: async (userId: string, itemId: string): Promise<InventoryRow | null> => {
    const rows = await query<InventoryRow>(
      `SELECT * FROM inventories WHERE user_id = $1 AND item_id = $2`,
      [userId, itemId]
    );
    return rows[0] || null;
  },

  getById: async (id: string): Promise<InventoryRow | null> => {
    const rows = await query<InventoryRow>(
      `SELECT * FROM inventories WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  create: async (data: InventoryInsert): Promise<InventoryRow> => {
    const rows = await query<InventoryRow>(
      `INSERT INTO inventories (user_id, shop_item_id, item_id, quantity, purchased_at, last_used_at, uses_remaining, is_active, expires_at, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [
        data.user_id,
        data.shop_item_id,
        data.item_id,
        data.quantity,
        data.purchased_at ?? new Date(),
        data.last_used_at,
        data.uses_remaining ?? null,
        data.is_active ?? false,
        data.expires_at,
        data.metadata ?? null,
      ]
    );
    return rows[0];
  },

  update: async (id: string, data: InventoryUpdate): Promise<InventoryRow | null> => {
    const fields = Object.keys(data).map((key, idx) => `${key} = $${idx + 1}`);
    const values = Object.values(data);
    values.push(id);
    
    const rows = await query<InventoryRow>(
      `UPDATE inventories SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  delete: async (id: string): Promise<InventoryRow | null> => {
    const rows = await query<InventoryRow>(
      `DELETE FROM inventories WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  consume: async (id: string): Promise<InventoryRow | null> => {
    const rows = await query<InventoryRow>(
      `UPDATE inventories SET quantity = quantity - 1, last_used_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  getActivePasses: async (userId: string): Promise<InventoryRow[]> => {
    return query<InventoryRow>(
      `SELECT * FROM inventories WHERE user_id = $1 AND is_active = true AND is_consumable = false`,
      [userId]
    );
  },

  hasItem: async (userId: string, itemId: string): Promise<boolean> => {
    const row = await inventoryQueries.getByUserIdAndItemId(userId, itemId);
    return row !== null && row.quantity > 0;
  },

  hasActivePass: async (userId: string, itemId: string): Promise<boolean> => {
    const row = await inventoryQueries.getByUserIdAndItemId(userId, itemId);
    return row !== null && row.quantity > 0 && row.is_active === true;
  },
};

// ============================================
// MARKET EVENT QUERIES
// ============================================

export const marketEventQueries = {
  create: async (data: MarketEventInsert): Promise<MarketEventRow> => {
    const rows = await query<MarketEventRow>(
      `INSERT INTO market_events (event_type, ticker, old_price, new_price, change_percent, category, triggered_by, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        data.event_type,
        data.ticker ?? null,
        data.old_price ?? null,
        data.new_price ?? null,
        data.change_percent ?? null,
        data.category ?? null,
        data.triggered_by ?? null,
        data.metadata ?? null,
      ]
    );
    return rows[0];
  },

  getRecent: async (limit: number = 100): Promise<MarketEventRow[]> => {
    return query<MarketEventRow>(
      `SELECT * FROM market_events ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
  },

  getByType: async (eventType: string, limit: number = 100): Promise<MarketEventRow[]> => {
    return query<MarketEventRow>(
      `SELECT * FROM market_events WHERE event_type = $1 ORDER BY created_at DESC LIMIT $2`,
      [eventType, limit]
    );
  },

  getByTicker: async (ticker: string, limit: number = 100): Promise<MarketEventRow[]> => {
    return query<MarketEventRow>(
      `SELECT * FROM market_events WHERE ticker = $1 ORDER BY created_at DESC LIMIT $2`,
      [ticker, limit]
    );
  },
};

// ============================================
// LOAN QUERIES
// ============================================

export const loanQueries = {
  getByUserId: async (userId: string): Promise<LoanRow[]> => {
    return query<LoanRow>(
      `SELECT * FROM loans WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
  },

  getActiveByUserId: async (userId: string): Promise<LoanRow | null> => {
    const rows = await query<LoanRow>(
      `SELECT * FROM loans WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  create: async (data: LoanInsert): Promise<LoanRow> => {
    const rows = await query<LoanRow>(
      `INSERT INTO loans (user_id, amount, interest_rate, taken_at, due_at, repaid_at, total_interest_paid, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        data.user_id,
        data.amount,
        data.interest_rate ?? 0.05,
        data.taken_at ?? new Date(),
        data.due_at,
        data.repaid_at,
        data.total_interest_paid ?? 0,
        data.is_active ?? true,
      ]
    );
    return rows[0];
  },

  update: async (id: string, data: LoanUpdate): Promise<LoanRow | null> => {
    const fields = Object.keys(data).map((key, idx) => `${key} = $${idx + 1}`);
    const values = Object.values(data);
    values.push(id);
    
    const rows = await query<LoanRow>(
      `UPDATE loans SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  repay: async (id: string, amount: number): Promise<LoanRow | null> => {
    const rows = await query<LoanRow>(
      `UPDATE loans SET amount = amount - $1, total_interest_paid = total_interest_paid + $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [amount, amount * 0.05, id]
    );
    return rows[0] || null;
  },

  markAsInactive: async (id: string): Promise<LoanRow | null> => {
    const rows = await query<LoanRow>(
      `UPDATE loans SET is_active = false, repaid_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },
};

// ============================================
// NOTIFICATION QUERIES
// ============================================

export const notificationQueries = {
  create: async (data: NotificationInsert): Promise<NotificationRow> => {
    const rows = await query<NotificationRow>(
      `INSERT INTO notifications (user_id, notification_type, title, message, metadata, is_read, is_sent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        data.user_id,
        data.notification_type,
        data.title,
        data.message,
        data.metadata ?? null,
        data.is_read ?? false,
        data.is_sent ?? false,
      ]
    );
    return rows[0];
  },

  getByUserId: async (userId: string, limit: number = 50): Promise<NotificationRow[]> => {
    return query<NotificationRow>(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
  },

  getUnsent: async (): Promise<NotificationRow[]> => {
    return query<NotificationRow>(
      `SELECT * FROM notifications WHERE is_sent = false ORDER BY created_at ASC`
    );
  },

  markAsSent: async (id: string): Promise<NotificationRow | null> => {
    const rows = await query<NotificationRow>(
      `UPDATE notifications SET is_sent = true, sent_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  markAsRead: async (id: string): Promise<NotificationRow | null> => {
    const rows = await query<NotificationRow>(
      `UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  delete: async (id: string): Promise<NotificationRow | null> => {
    const rows = await query<NotificationRow>(
      `DELETE FROM notifications WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },
};

// ============================================
// MANIPULATION QUEUE QUERIES
// ============================================

export const manipulationQueueQueries = {
  create: async (data: ManipulationQueueInsert): Promise<ManipulationQueueRow> => {
    const rows = await query<ManipulationQueueRow>(
      `INSERT INTO manipulation_queue (user_id, discord_id, ticker, manipulation_type, amount, scheduled_for, executed_at, is_executed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        data.user_id,
        data.discord_id,
        data.ticker,
        data.manipulation_type,
        data.amount ?? 0.15,
        data.scheduled_for,
        data.executed_at,
        data.is_executed ?? false,
      ]
    );
    return rows[0];
  },

  getPending: async (): Promise<ManipulationQueueRow[]> => {
    return query<ManipulationQueueRow>(
      `SELECT * FROM manipulation_queue WHERE is_executed = false AND scheduled_for <= NOW() ORDER BY scheduled_for ASC`
    );
  },

  getByUserId: async (userId: string): Promise<ManipulationQueueRow[]> => {
    return query<ManipulationQueueRow>(
      `SELECT * FROM manipulation_queue WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
  },

  markAsExecuted: async (id: string): Promise<ManipulationQueueRow | null> => {
    const rows = await query<ManipulationQueueRow>(
      `UPDATE manipulation_queue SET is_executed = true, executed_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  delete: async (id: string): Promise<ManipulationQueueRow | null> => {
    const rows = await query<ManipulationQueueRow>(
      `DELETE FROM manipulation_queue WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  cleanupOld: async (): Promise<void> => {
    await query(
      `DELETE FROM manipulation_queue WHERE is_executed = true AND created_at < NOW() - INTERVAL '7 days'`
    );
  },
};

// ============================================
// EXPORT ALL QUERIES
// ============================================

export {
  userProfileQueries,
  stockQueries,
  portfolioQueries,
  transactionQueries,
  shopItemQueries,
  inventoryQueries,
  marketEventQueries,
  loanQueries,
  notificationQueries,
  manipulationQueueQueries,
};
