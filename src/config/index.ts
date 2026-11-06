import dotenv from 'dotenv';
dotenv.config();

// ============================================
// ENVIRONMENT CONFIGURATION
// ============================================
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
export const DATABASE_URL = process.env.DATABASE_URL!;
export const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://blackswan.dashboard.com';

// ============================================
// MARKET CONFIGURATION
// ============================================
export const MARKET_CONFIG = {
  TICK_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  MIN_TICK_INTERVAL_MS: 5 * 60 * 1000,
  MAX_TICK_INTERVAL_MS: 10 * 60 * 1000,
  BASE_VOLATILITY_RANGE: { min: 0.01, max: 0.15 },
  RANDOM_SWING_RANGE: { min: -1.0, max: 1.0 },
  BLACK_SWAN_CHANCE: 0.02, // 2% chance per hour
  BLACK_SWAN_CRASH_RANGE: { min: 0.60, max: 0.80 }, // 60-80% crash
  BLACK_SWAN_GOLD_BOOST: 2.00, // 200% increase (3x)
  MANIPULATED_PRICE_CHANGE: 0.15, // 15% for Pump/Dump cards
};

// ============================================
// FINANCIAL CONFIGURATION
// ============================================
export const FINANCIAL_CONFIG = {
  STARTER_CASH: 1000,
  LOAN_MAX_PERCENTAGE: 0.50, // 50% of net worth
  LOAN_INTEREST_RATE: 0.05, // 5% per hour
  LOAN_LIQUIDATION_HOURS: 24, // Liquidate after 24 hours unpaid
  HYPER_WEALTH_TAX_THRESHOLD: 1000000, // $1,000,000
  HYPER_WEALTH_TAX_RATE: 0.15, // 15%
  TAX_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours
  STOP_LOSS_THRESHOLD: 0.20, // 20% drop
  BAILOUT_BOND_REIMBURSEMENT: 0.50, // 50% reimbursement
  WHALE_TRACKER_THRESHOLD: 500000, // $500,000
};

// ============================================
// STOCK CATEGORIES
// ============================================
export const STOCK_CATEGORIES = {
  TECH: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA'],
  MEME: ['GME', 'AMC', 'BB', 'WSB', 'DOGE', 'SHIB'],
  SAFE_HAVEN: ['GOLD', 'SILVER', 'BTC'],
  ALL: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'GME', 'AMC', 'BB', 'WSB', 'DOGE', 'SHIB', 'GOLD', 'SILVER', 'BTC'],
};

// ============================================
// SHOP ITEM TYPES
// ============================================
export const SHOP_ITEM_TYPES = {
  STOP_LOSS_CONTRACT: 'stop_loss_contract',
  BAILOUT_BOND: 'bailout_bond',
  GOLD_BULLION: 'gold_bullion',
  CORPORATE_ESPIONAGE_KEY: 'corporate_espionage_key',
  ANALYST_TERMINAL_PASS: 'analyst_terminal_pass',
  WHALE_TRACKER_SUBSCRIPTION: 'whale_tracker_subscription',
  PUMP_CARD: 'pump_card',
  DUMP_CARD: 'dump_card',
  TAX_HAVEN_REGISTRATION: 'tax_haven_registration',
  ANIMATED_SKIN: 'animated_skin',
  MAJORITY_SHAREHOLDER_BADGE: 'majority_shareholder_badge',
  CUSTOM_LEADERBOARD_TITLE: 'custom_leaderboard_title',
} as const;

export type ShopItemType = typeof SHOP_ITEM_TYPES[keyof typeof SHOP_ITEM_TYPES];

// ============================================
// DISCORD CONFIGURATION
// ============================================
export const DISCORD_CONFIG = {
  CLIENT_OPTIONS: {
    intents: [
      'Guilds',
      'GuildMessages',
      'GuildMessageReactions',
      'DirectMessages',
      'MessageContent',
    ],
  },
};

// ============================================
// DATABASE POOL CONFIGURATION
// ============================================
export const POOL_CONFIG = {
  max: 20, // Maximum number of clients in the pool
  min: 4, // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  maxLifetimeSeconds: 60 * 60, // Close clients after 1 hour of use
};

// ============================================
// VALIDATION
// ============================================
if (!DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN is required in environment variables');
}
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required in environment variables');
}
