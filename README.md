# Black Swan - Discord Stock Market & Financial Crash Economy Bot

A high-concurrency Discord bot built with TypeScript, Node.js v20+, and PostgreSQL/Supabase. Features dynamic stock markets, Black Swan events, loans, taxes, and an integrated virtual shop system.

## Features

### 📈 Dynamic Stock Market
- Automated price updates every 5-10 minutes
- Random swing with base volatility formula
- Hidden "Is_Manipulated" flag for special behavior
- Black Swan events (2% chance per hour) that crash TECH/MEME markets by 60-80% while inflating GOLD by 200%

### 💰 Financial Mechanics
- **Starter Cash:** $1,000 for new players
- **Bank Loans:** Up to 50% of net worth, 5% interest per hour, liquidation after 24 hours unpaid
- **Hyper-Wealth Tax:** 15% tax on cash balances over $1,000,000 every 24 hours

### 🎮 Discord Commands
- `/join` - Create starting profile
- `/stocks` - Quick stock summary with dashboard link
- `/buy [ticker] [shares]` - Atomic market buy
- `/sell [ticker] [shares]` - Atomic market sell
- `/loan [take/repay/info] [amount]` - Manage bank loans

### 🛒 Virtual Shop Items

#### A. Financial Protection & Insurance
- **Stop-Loss Contracts** - Auto-sell at 20% drop threshold
- **Bailout Bonds** - 50% cash reimbursement on Black Swan crashes
- **Gold Bullion Asset** - Stable, immune to market crashes

#### B. Insider Trading & Intelligence
- **Corporate Espionage Keys** - Reveal hidden baseVolatility
- **Analyst Terminal Pass** - Permanent advanced query access
- **Whale Tracker Subscription** - DM notifications on >$500k transactions

#### C. Dashboard Customization
- Animated Profile Skins
- Majority Shareholder Badges
- Custom Leaderboard Titles

#### D. Server Power Tactics (Chaos Cards)
- **Pump Card** - Force +15% on chosen ticker
- **Dump Card** - Force -15% on chosen ticker
- **Tax Haven Registration** - Skip hyper-wealth tax

## Prerequisites

- Node.js v20+
- PostgreSQL/Supabase database
- Discord Bot Token

## Installation

```bash
# Clone repository
git clone https://github.com/Astro643/black-swan.git
cd black-swan

# Install dependencies
npm install

# Build TypeScript
npm run build
```

## Configuration

Create a `.env` file in the project root:

```env
# Discord Bot Token
DISCORD_TOKEN=your_discord_bot_token_here

# PostgreSQL/Supabase Database URL
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# Optional: Web Dashboard URL
DASHBOARD_URL=https://your-dashboard-url.com

# Optional: Development Guild ID (for faster command deployment)
DEV_GUILD_ID=your_guild_id_here
```

## Database Schema

The bot expects the following tables to exist in your PostgreSQL database:

```sql
-- User Profiles
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  discriminator VARCHAR(255) NOT NULL,
  avatar TEXT,
  cash DECIMAL(15, 2) DEFAULT 1000,
  net_worth DECIMAL(15, 2) DEFAULT 1000,
  loan_amount DECIMAL(15, 2) DEFAULT 0,
  loan_taken_at TIMESTAMP,
  last_interest_at TIMESTAMP,
  loan_payments_missed INTEGER DEFAULT 0,
  total_earnings DECIMAL(15, 2) DEFAULT 0,
  total_spent DECIMAL(15, 2) DEFAULT 0,
  cosmetic_ids TEXT[] DEFAULT '{}',
  has_analyst_pass BOOLEAN DEFAULT false,
  is_liquidated BOOLEAN DEFAULT false,
  last_tax_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Stocks
CREATE TABLE stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  current_price DECIMAL(15, 2) NOT NULL,
  base_volatility DECIMAL(5, 4) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'TECH', 'MEME', 'SAFE_HAVEN'
  is_manipulated BOOLEAN DEFAULT false,
  manipulated_by VARCHAR(255),
  manipulated_type VARCHAR(10), -- 'PUMP', 'DUMP'
  manipulated_at TIMESTAMP,
  last_price_update TIMESTAMP DEFAULT NOW(),
  volume_24h DECIMAL(15, 2) DEFAULT 0,
  market_cap DECIMAL(15, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Portfolios
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL,
  shares DECIMAL(15, 4) NOT NULL DEFAULT 0,
  average_price DECIMAL(15, 2) NOT NULL,
  total_invested DECIMAL(15, 2) NOT NULL DEFAULT 0,
  stop_loss_price DECIMAL(15, 2),
  stop_loss_contract_id UUID REFERENCES inventories(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL, -- 'BUY', 'SELL', 'LOAN_TAKE', 'LOAN_REPAY', 'INTEREST', 'TAX', 'LIQUIDATION', 'BAILOUT', 'STOP_LOSS'
  ticker VARCHAR(10),
  shares DECIMAL(15, 4),
  price DECIMAL(15, 2),
  amount DECIMAL(15, 2) NOT NULL,
  fee DECIMAL(15, 2) DEFAULT 0,
  balance_after DECIMAL(15, 2) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Shop Items
CREATE TABLE shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(15, 2) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'PROTECTION', 'INTELLIGENCE', 'COSMETIC', 'CHAOS'
  is_consumable BOOLEAN DEFAULT false,
  is_active_pass BOOLEAN DEFAULT false,
  is_permanent BOOLEAN DEFAULT false,
  cooldown_hours INTEGER,
  max_uses INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inventories
CREATE TABLE inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  shop_item_id UUID NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  item_id VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  purchased_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  uses_remaining INTEGER,
  is_active BOOLEAN DEFAULT false,
  expires_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Market Events
CREATE TABLE market_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL, -- 'PRICE_UPDATE', 'BLACK_SWAN', 'MANIPULATION', 'CRASH', 'PUMP'
  ticker VARCHAR(10),
  old_price DECIMAL(15, 2),
  new_price DECIMAL(15, 2),
  change_percent DECIMAL(10, 2),
  category VARCHAR(50),
  triggered_by VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Loans
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  interest_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.05,
  taken_at TIMESTAMP DEFAULT NOW(),
  due_at TIMESTAMP,
  repaid_at TIMESTAMP,
  total_interest_paid DECIMAL(15, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'WHALE_TRANSACTION', 'STOP_LOSS_TRIGGERED', 'BAILOUT_ACTIVATED', 'LOAN_DUE', 'TAX_PAID', 'MARKET_CRASH', 'MARKET_PUMP'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  is_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP
);

-- Manipulation Queue
CREATE TABLE manipulation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  discord_id VARCHAR(255) NOT NULL,
  ticker VARCHAR(10) NOT NULL,
  manipulation_type VARCHAR(10) NOT NULL, -- 'PUMP', 'DUMP'
  amount DECIMAL(5, 4) DEFAULT 0.15,
  scheduled_for TIMESTAMP DEFAULT NOW(),
  executed_at TIMESTAMP,
  is_executed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sample Data (Optional)
-- Insert sample stocks
INSERT INTO stocks (ticker, name, current_price, base_volatility, category) VALUES
  ('AAPL', 'Apple Inc.', 150.00, 0.05, 'TECH'),
  ('MSFT', 'Microsoft Corporation', 300.00, 0.04, 'TECH'),
  ('GOOGL', 'Alphabet Inc.', 120.00, 0.06, 'TECH'),
  ('AMZN', 'Amazon.com Inc.', 100.00, 0.07, 'TECH'),
  ('TSLA', 'Tesla Inc.', 200.00, 0.10, 'TECH'),
  ('META', 'Meta Platforms Inc.', 150.00, 0.08, 'TECH'),
  ('NVDA', 'NVIDIA Corporation', 400.00, 0.12, 'TECH'),
  ('GME', 'GameStop Corp.', 20.00, 0.15, 'MEME'),
  ('AMC', 'AMC Entertainment', 15.00, 0.14, 'MEME'),
  ('BB', 'BlackBerry Limited', 10.00, 0.13, 'MEME'),
  ('WSB', 'WallStreetBets', 5.00, 0.20, 'MEME'),
  ('DOGE', 'Dogecoin', 0.10, 0.25, 'MEME'),
  ('SHIB', 'Shiba Inu', 0.00001, 0.30, 'MEME'),
  ('GOLD', 'Gold Bullion', 1800.00, 0.01, 'SAFE_HAVEN'),
  ('SILVER', 'Silver Bullion', 25.00, 0.02, 'SAFE_HAVEN'),
  ('BTC', 'Bitcoin', 50000.00, 0.08, 'SAFE_HAVEN');

-- Insert sample shop items
INSERT INTO shop_items (item_id, name, description, price, category, is_consumable, is_active_pass, is_permanent) VALUES
  -- Protection
  ('stop_loss_contract', 'Stop-Loss Contract', 'Auto-sell at 20% drop threshold', 500, 'PROTECTION', true, false, false),
  ('bailout_bond', 'Bailout Bond', '50% reimbursement on Black Swan crashes', 10000, 'PROTECTION', false, true, false),
  ('gold_bullion', 'Gold Bullion Asset', 'Stable, immune to market crashes', 2000, 'PROTECTION', false, true, false),
  -- Intelligence
  ('corporate_espionage_key', 'Corporate Espionage Key', 'Reveal a stock''s base volatility', 1000, 'INTELLIGENCE', true, false, false),
  ('analyst_terminal_pass', 'Analyst Terminal Pass', 'Permanent advanced query access', 5000, 'INTELLIGENCE', false, true, true),
  ('whale_tracker_subscription', 'Whale Tracker Subscription', 'DM notifications on >$500k transactions', 2000, 'INTELLIGENCE', false, true, false),
  -- Chaos
  ('pump_card', 'Pump Card', 'Force +15% on chosen ticker', 5000, 'CHAOS', true, false, false),
  ('dump_card', 'Dump Card', 'Force -15% on chosen ticker', 5000, 'CHAOS', true, false, false),
  ('tax_haven_registration', 'Tax Haven Registration', 'Skip hyper-wealth tax', 25000, 'CHAOS', false, true, false);
```

## Running the Bot

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

## Project Structure

```
black-swan/
├── src/
│   ├── config/
│   │   └── index.ts          # Configuration constants
│   ├── db/
│   │   ├── client.ts         # Database client & queries
│   │   └── types.ts          # TypeScript interfaces
│   ├── engines/
│   │   ├── market.ts         # Stock market engine
│   │   ├── loan.ts           # Loan engine
│   │   └── tax.ts            # Tax engine
│   ├── services/
│   │   ├── portfolio.ts      # Portfolio management
│   │   ├── shop.ts           # Shop service
│   │   └── notifications.ts  # Notification service
│   ├── commands/
│   │   ├── index.ts          # Command exports
│   │   ├── join.ts           # /join command
│   │   ├── stocks.ts         # /stocks command
│   │   ├── buy.ts            # /buy command
│   │   ├── sell.ts           # /sell command
│   │   └── loan.ts           # /loan command
│   └── bot.ts                # Main bot file
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/join` | Create your starting profile with $1,000 cash |
| `/stocks` | View all active stocks with prices and dashboard link |
| `/buy [ticker] [shares]` | Buy shares of a stock at current market price |
| `/sell [ticker] [shares]` | Sell shares of a stock at current market price |
| `/loan take [amount]` | Take out a loan up to 50% of net worth |
| `/loan repay [amount]` | Repay part or all of your loan |
| `/loan info` | View your current loan information |

## Architecture Highlights

### 🔄 Background Processes
- **Market Engine**: Runs every 5-10 minutes, updates all stock prices, checks for Black Swan events, processes manipulation queue, checks stop-loss orders
- **Loan Engine**: Runs every hour, applies interest to all active loans, checks for liquidations
- **Tax Engine**: Runs every 24 hours, applies 15% tax to users with >$1M cash (except Tax Haven holders)
- **Notification Service**: Runs every 30 seconds, sends queued notifications, monitors whale transactions

### 💾 Database Connection
- Uses `pg` library with connection pooling
- Pool configuration optimized for high-concurrency Discord events
- All database operations are async/await with proper error handling
- Transaction support for atomic operations (buy/sell, loan take/repay)

### 📊 Type Safety
- Complete TypeScript interfaces for all database tables
- Strict typing for all function parameters and return values
- Type-safe query builders and result handlers

### ⚡ Performance
- Connection pooling for high-volume Discord events
- Batch operations for market updates
- Efficient queries with proper indexing
- Minimal Discord API calls (text commands only, web UI for complex interactions)

## Discord Bot Setup

1. Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a bot and copy the token
3. Invite the bot to your server with the following permissions:
   - Send Messages
   - Send Messages in Threads
   - Create Public Threads
   - Create Private Threads
   - Embed Links
   - Attach Files
   - Read Message History
   - Use External Emojis
   - Add Reactions

## License

MIT

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## Support

For issues or questions, please open a GitHub issue.
