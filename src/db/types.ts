import { ShopItemType } from '../config';

// ============================================
// USER & PROFILE TYPES
// ============================================

export interface UserProfileRow {
  id: string; // UUID
  discord_id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  created_at: Date;
  updated_at: Date;
  cash: number; // Liquid cash balance
  net_worth: number; // Total value including stocks
  loan_amount: number; // Current outstanding loan
  loan_taken_at: Date | null;
  last_interest_at: Date | null;
  loan_payments_missed: number;
  total_earnings: number; // Lifetime earnings
  total_spent: number; // Lifetime spending
  is_active: boolean;
  cosmetic_ids: string[]; // Array of unlocked cosmetic IDs
  has_analyst_pass: boolean;
  is_liquidated: boolean;
  last_tax_at: Date | null;
}

export interface UserProfileInsert {
  discord_id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  cash?: number;
  net_worth?: number;
  loan_amount?: number;
  loan_taken_at?: Date | null;
  last_interest_at?: Date | null;
  loan_payments_missed?: number;
  total_earnings?: number;
  total_spent?: number;
  cosmetic_ids?: string[];
  has_analyst_pass?: boolean;
  is_liquidated?: boolean;
  last_tax_at?: Date | null;
}

export interface UserProfileUpdate {
  cash?: number;
  net_worth?: number;
  loan_amount?: number;
  loan_taken_at?: Date | null;
  last_interest_at?: Date | null;
  loan_payments_missed?: number;
  total_earnings?: number;
  total_spent?: number;
  username?: string;
  discriminator?: string;
  avatar?: string | null;
  cosmetic_ids?: string[];
  has_analyst_pass?: boolean;
  is_liquidated?: boolean;
  last_tax_at?: Date | null;
  updated_at?: Date;
}

// ============================================
// STOCK TYPES
// ============================================

export interface StockRow {
  id: string; // UUID
  ticker: string; // e.g., 'AAPL', 'GOLD'
  name: string;
  current_price: number;
  base_volatility: number; // 0.01 - 0.15
  category: 'TECH' | 'MEME' | 'SAFE_HAVEN';
  is_manipulated: boolean;
  manipulated_by: string | null; // discord_id of user who manipulated
  manipulated_type: 'PUMP' | 'DUMP' | null;
  manipulated_at: Date | null;
  last_price_update: Date;
  volume_24h: number;
  market_cap: number;
  is_active: boolean;
  created_at: Date;
}

export interface StockInsert {
  ticker: string;
  name: string;
  current_price: number;
  base_volatility: number;
  category: 'TECH' | 'MEME' | 'SAFE_HAVEN';
  is_manipulated?: boolean;
  manipulated_by?: string | null;
  manipulated_type?: 'PUMP' | 'DUMP' | null;
  manipulated_at?: Date | null;
  volume_24h?: number;
  market_cap?: number;
  is_active?: boolean;
}

export interface StockUpdate {
  current_price?: number;
  base_volatility?: number;
  category?: 'TECH' | 'MEME' | 'SAFE_HAVEN';
  is_manipulated?: boolean;
  manipulated_by?: string | null;
  manipulated_type?: 'PUMP' | 'DUMP' | null;
  manipulated_at?: Date | null;
  last_price_update?: Date;
  volume_24h?: number;
  market_cap?: number;
  is_active?: boolean;
}

// ============================================
// PORTFOLIO TYPES
// ============================================

export interface PortfolioRow {
  id: string; // UUID
  user_id: string; // UUID reference to UserProfile
  stock_id: string; // UUID reference to Stock
  ticker: string; // Denormalized for quick access
  shares: number;
  average_price: number; // Average purchase price
  total_invested: number; // Total cash spent on this position
  stop_loss_price: number | null; // If stop-loss is active
  stop_loss_contract_id: string | null; // Reference to inventory item
  created_at: Date;
  updated_at: Date;
}

export interface PortfolioInsert {
  user_id: string;
  stock_id: string;
  ticker: string;
  shares: number;
  average_price: number;
  total_invested: number;
  stop_loss_price?: number | null;
  stop_loss_contract_id?: string | null;
}

export interface PortfolioUpdate {
  shares?: number;
  average_price?: number;
  total_invested?: number;
  stop_loss_price?: number | null;
  stop_loss_contract_id?: string | null;
  updated_at?: Date;
}

// ============================================
// TRANSACTION TYPES
// ============================================

export type TransactionType = 'BUY' | 'SELL' | 'LOAN_TAKE' | 'LOAN_REPAY' | 'INTEREST' | 'TAX' | 'LIQUIDATION' | 'BAILOUT' | 'STOP_LOSS';

export interface TransactionRow {
  id: string; // UUID
  user_id: string; // UUID reference to UserProfile
  transaction_type: TransactionType;
  ticker: string | null; // Stock ticker (null for non-stock transactions)
  shares: number | null; // Shares traded (null for non-stock)
  price: number | null; // Price per share
  amount: number; // Total cash amount
  fee: number; // Transaction fee (if any)
  balance_after: number; // User's cash balance after transaction
  metadata: Record<string, unknown> | null; // Additional data
  created_at: Date;
}

export interface TransactionInsert {
  user_id: string;
  transaction_type: TransactionType;
  ticker?: string | null;
  shares?: number | null;
  price?: number | null;
  amount: number;
  fee?: number;
  balance_after: number;
  metadata?: Record<string, unknown> | null;
}

// ============================================
// SHOP ITEM TYPES
// ============================================

export interface ShopItemRow {
  id: string; // UUID
  item_id: ShopItemType;
  name: string;
  description: string;
  price: number;
  category: 'PROTECTION' | 'INTELLIGENCE' | 'COSMETIC' | 'CHAOS';
  is_consumable: boolean;
  is_active_pass: boolean;
  is_permanent: boolean;
  cooldown_hours: number | null; // For consumables
  max_uses: number | null; // For consumables
  is_active: boolean;
  created_at: Date;
}

export interface ShopItemInsert {
  item_id: ShopItemType;
  name: string;
  description: string;
  price: number;
  category: 'PROTECTION' | 'INTELLIGENCE' | 'COSMETIC' | 'CHAOS';
  is_consumable?: boolean;
  is_active_pass?: boolean;
  is_permanent?: boolean;
  cooldown_hours?: number | null;
  max_uses?: number | null;
  is_active?: boolean;
}

// ============================================
// INVENTORY TYPES
// ============================================

export interface InventoryRow {
  id: string; // UUID
  user_id: string; // UUID reference to UserProfile
  shop_item_id: string; // UUID reference to ShopItem
  item_id: ShopItemType; // Denormalized for quick access
  quantity: number;
  purchased_at: Date;
  last_used_at: Date | null;
  uses_remaining: number | null; // For consumables
  is_active: boolean; // For active passes
  expires_at: Date | null; // For time-limited items
  metadata: Record<string, unknown> | null; // Item-specific data
  created_at: Date;
}

export interface InventoryInsert {
  user_id: string;
  shop_item_id: string;
  item_id: ShopItemType;
  quantity: number;
  purchased_at?: Date;
  last_used_at?: Date | null;
  uses_remaining?: number | null;
  is_active?: boolean;
  expires_at?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface InventoryUpdate {
  quantity?: number;
  last_used_at?: Date | null;
  uses_remaining?: number | null;
  is_active?: boolean;
  expires_at?: Date | null;
  metadata?: Record<string, unknown> | null;
}

// ============================================
// MARKET EVENT TYPES
// ============================================

export type MarketEventType = 'PRICE_UPDATE' | 'BLACK_SWAN' | 'MANIPULATION' | 'CRASH' | 'PUMP';

export interface MarketEventRow {
  id: string; // UUID
  event_type: MarketEventType;
  ticker: string | null; // null for global events
  old_price: number | null;
  new_price: number | null;
  change_percent: number | null;
  category: string | null; // TECH, MEME, etc.
  triggered_by: string | null; // discord_id or system
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface MarketEventInsert {
  event_type: MarketEventType;
  ticker?: string | null;
  old_price?: number | null;
  new_price?: number | null;
  change_percent?: number | null;
  category?: string | null;
  triggered_by?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ============================================
// LOAN TYPES
// ============================================

export interface LoanRow {
  id: string; // UUID
  user_id: string; // UUID reference to UserProfile
  amount: number;
  interest_rate: number;
  taken_at: Date;
  due_at: Date | null;
  repaid_at: Date | null;
  total_interest_paid: number;
  is_active: boolean;
  created_at: Date;
}

export interface LoanInsert {
  user_id: string;
  amount: number;
  interest_rate?: number;
  taken_at?: Date;
  due_at?: Date | null;
  repaid_at?: Date | null;
  total_interest_paid?: number;
  is_active?: boolean;
}

export interface LoanUpdate {
  amount?: number;
  interest_rate?: number;
  due_at?: Date | null;
  repaid_at?: Date | null;
  total_interest_paid?: number;
  is_active?: boolean;
}

// ============================================
// NOTIFICATION TYPES
// ============================================

export interface NotificationRow {
  id: string; // UUID
  user_id: string; // UUID reference to UserProfile
  notification_type: 'WHALE_TRANSACTION' | 'STOP_LOSS_TRIGGERED' | 'BAILOUT_ACTIVATED' | 'LOAN_DUE' | 'TAX_PAID' | 'MARKET_CRASH' | 'MARKET_PUMP';
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  is_sent: boolean; // Whether DM was successfully sent
  created_at: Date;
  sent_at: Date | null;
}

export interface NotificationInsert {
  user_id: string;
  notification_type: 'WHALE_TRANSACTION' | 'STOP_LOSS_TRIGGERED' | 'BAILOUT_ACTIVATED' | 'LOAN_DUE' | 'TAX_PAID' | 'MARKET_CRASH' | 'MARKET_PUMP';
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  is_read?: boolean;
  is_sent?: boolean;
  sent_at?: Date | null;
}

export interface NotificationUpdate {
  is_read?: boolean;
  is_sent?: boolean;
  sent_at?: Date | null;
}

// ============================================
// MANIPULATION QUEUE TYPES
// ============================================

export type ManipulationType = 'PUMP' | 'DUMP';

export interface ManipulationQueueRow {
  id: string; // UUID
  user_id: string; // UUID reference to UserProfile
  discord_id: string;
  ticker: string;
  manipulation_type: ManipulationType;
  amount: number; // Percentage change
  scheduled_for: Date;
  executed_at: Date | null;
  is_executed: boolean;
  created_at: Date;
}

export interface ManipulationQueueInsert {
  user_id: string;
  discord_id: string;
  ticker: string;
  manipulation_type: ManipulationType;
  amount?: number;
  scheduled_for: Date;
  executed_at?: Date | null;
  is_executed?: boolean;
}

export interface ManipulationQueueUpdate {
  executed_at?: Date | null;
  is_executed?: boolean;
}

// ============================================
// DATABASE RESULT TYPES
// ============================================

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseError extends Error {
  code: string;
  detail: string;
  hint: string;
}
