import {
  userProfileQueries,
  stockQueries,
  portfolioQueries,
  transactionQueries,
  inventoryQueries,
} from '../db/client';
import { UserProfileRow, StockRow, PortfolioRow } from '../db/types';
import { FINANCIAL_CONFIG, SHOP_ITEM_TYPES } from '../config';

// ============================================
// PORTFOLIO SERVICE
// ============================================

export interface BuyResult {
  success: boolean;
  error?: string;
  sharesBought?: number;
  totalCost?: number;
  averagePrice?: number;
  newCash?: number;
  portfolioItem?: PortfolioRow;
}

export interface SellResult {
  success: boolean;
  error?: string;
  sharesSold?: number;
  totalValue?: number;
  newCash?: number;
  remainingShares?: number;
}

export interface PortfolioSummary {
  userId: string;
  cash: number;
  netWorth: number;
  loanAmount: number;
  positions: {
    ticker: string;
    shares: number;
    averagePrice: number;
    currentPrice: number;
    totalValue: number;
    profitLoss: number;
    profitLossPercent: number;
  }[];
  totalPortfolioValue: number;
  totalProfitLoss: number;
}

export class PortfolioService {
  // ============================================
  // BUY STOCK
  // ============================================

  async buyStock(
    userId: string,
    ticker: string,
    shares: number
  ): Promise<BuyResult> {
    const user = await userProfileQueries.getById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const stock = await stockQueries.getByTicker(ticker);
    if (!stock) {
      return { success: false, error: 'Stock not found' };
    }

    if (!stock.is_active) {
      return { success: false, error: 'Stock is not active' };
    }

    if (shares <= 0) {
      return { success: false, error: 'Shares must be positive' };
    }

    // Check if user has enough cash
    const totalCost = shares * stock.current_price;
    if (user.cash < totalCost) {
      return { success: false, error: `Insufficient cash. Need $${totalCost.toFixed(2)}` };
    }

    // Check if user already has this stock
    let portfolioItem = await portfolioQueries.getByUserIdAndTicker(userId, ticker);

    if (portfolioItem) {
      // Update existing position
      const newShares = portfolioItem.shares + shares;
      const newTotalInvested = portfolioItem.total_invested + totalCost;
      const newAveragePrice = newTotalInvested / newShares;

      await portfolioQueries.update(portfolioItem.id, {
        shares: newShares,
        average_price: newAveragePrice,
        total_invested: newTotalInvested,
      });

      portfolioItem = await portfolioQueries.getById(portfolioItem.id);
      if (!portfolioItem) {
        return { success: false, error: 'Failed to update portfolio' };
      }
    } else {
      // Create new position
      portfolioItem = await portfolioQueries.create({
        user_id: user.id,
        stock_id: stock.id,
        ticker,
        shares,
        average_price: stock.current_price,
        total_invested: totalCost,
      });
    }

    // Deduct cash from user
    const newCash = user.cash - totalCost;
    await userProfileQueries.update(user.id, {
      cash: newCash,
      total_spent: user.total_spent + totalCost,
    });

    // Update net worth
    const portfolioValue = await portfolioQueries.getTotalValue(user.id);
    await userProfileQueries.update(user.id, {
      net_worth: newCash + portfolioValue - user.loan_amount,
    });

    // Log transaction
    await transactionQueries.create({
      user_id: user.id,
      transaction_type: 'BUY',
      ticker,
      shares,
      price: stock.current_price,
      amount: totalCost,
      fee: 0,
      balance_after: newCash,
      metadata: { portfolioId: portfolioItem.id },
    });

    // Check for Whale Tracker notifications
    await this.checkWhaleTransaction(user, totalCost);

    return {
      success: true,
      sharesBought: shares,
      totalCost,
      averagePrice: portfolioItem.average_price,
      newCash,
      portfolioItem,
    };
  }

  // ============================================
  // SELL STOCK
  // ============================================

  async sellStock(
    userId: string,
    ticker: string,
    shares: number
  ): Promise<SellResult> {
    const user = await userProfileQueries.getById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const stock = await stockQueries.getByTicker(ticker);
    if (!stock) {
      return { success: false, error: 'Stock not found' };
    }

    if (!stock.is_active) {
      return { success: false, error: 'Stock is not active' };
    }

    if (shares <= 0) {
      return { success: false, error: 'Shares must be positive' };
    }

    // Get user's position
    const portfolioItem = await portfolioQueries.getByUserIdAndTicker(userId, ticker);
    if (!portfolioItem) {
      return { success: false, error: `You don't own any shares of ${ticker}` };
    }

    if (portfolioItem.shares < shares) {
      return { success: false, error: `You only have ${portfolioItem.shares} shares of ${ticker}` };
    }

    // Calculate sale value
    const totalValue = shares * stock.current_price;

    if (portfolioItem.shares === shares) {
      // Sell all shares - delete position
      await portfolioQueries.delete(portfolioItem.id);
    } else {
      // Partial sale - update position
      await portfolioQueries.update(portfolioItem.id, {
        shares: portfolioItem.shares - shares,
      });
    }

    // Add cash to user
    const newCash = user.cash + totalValue;
    await userProfileQueries.update(user.id, {
      cash: newCash,
      total_earnings: user.total_earnings + totalValue,
    });

    // Update net worth
    const portfolioValue = await portfolioQueries.getTotalValue(user.id);
    await userProfileQueries.update(user.id, {
      net_worth: newCash + portfolioValue - user.loan_amount,
    });

    // Log transaction
    await transactionQueries.create({
      user_id: user.id,
      transaction_type: 'SELL',
      ticker,
      shares,
      price: stock.current_price,
      amount: totalValue,
      fee: 0,
      balance_after: newCash,
      metadata: { portfolioId: portfolioItem.id },
    });

    // Check for Whale Tracker notifications
    await this.checkWhaleTransaction(user, totalValue);

    return {
      success: true,
      sharesSold: shares,
      totalValue,
      newCash,
      remainingShares: portfolioItem.shares - shares,
    };
  }

  // ============================================
  // PORTFOLIO SUMMARY
  // ============================================

  async getPortfolioSummary(userId: string): Promise<PortfolioSummary | null> {
    const user = await userProfileQueries.getById(userId);
    if (!user) return null;

    const portfolio = await portfolioQueries.getByUserId(userId);
    const stocks = await stockQueries.getAllActive();

    const positions = [];
    let totalPortfolioValue = 0;
    let totalProfitLoss = 0;

    for (const position of portfolio) {
      const stock = stocks.find(s => s.ticker === position.ticker);
      if (!stock) continue;

      const currentValue = position.shares * stock.current_price;
      const costBasis = position.total_invested;
      const profitLoss = currentValue - costBasis;
      const profitLossPercent = (profitLoss / costBasis) * 100;

      positions.push({
        ticker: position.ticker,
        shares: position.shares,
        averagePrice: position.average_price,
        currentPrice: stock.current_price,
        totalValue: currentValue,
        profitLoss,
        profitLossPercent,
      });

      totalPortfolioValue += currentValue;
      totalProfitLoss += profitLoss;
    }

    return {
      userId: user.id,
      cash: user.cash,
      netWorth: user.net_worth,
      loanAmount: user.loan_amount,
      positions,
      totalPortfolioValue,
      totalProfitLoss,
    };
  }

  // ============================================
  // PORTFOLIO VALUE
  // ============================================

  async getPortfolioValue(userId: string): Promise<number> {
    return portfolioQueries.getTotalValue(userId);
  }

  async getPositionValue(userId: string, ticker: string): Promise<number> {
    const position = await portfolioQueries.getByUserIdAndTicker(userId, ticker);
    if (!position) return 0;

    const stock = await stockQueries.getByTicker(ticker);
    if (!stock) return 0;

    return position.shares * stock.current_price;
  }

  // ============================================
  // POSITION DETAILS
  // ============================================

  async getPosition(userId: string, ticker: string): Promise<PortfolioRow | null> {
    return portfolioQueries.getByUserIdAndTicker(userId, ticker);
  }

  async getAllPositions(userId: string): Promise<PortfolioRow[]> {
    return portfolioQueries.getByUserId(userId);
  }

  // ============================================
  // PROFIT/LOSS CALCULATION
  // ============================================

  async getProfitLoss(userId: string): Promise<{
    total: number;
    totalPercent: number;
    byPosition: { ticker: string; profitLoss: number; profitLossPercent: number }[];
  }> {
    const portfolio = await portfolioQueries.getByUserId(userId);
    const stocks = await stockQueries.getAllActive();

    const byPosition = [];
    let totalProfitLoss = 0;
    let totalInvested = 0;

    for (const position of portfolio) {
      const stock = stocks.find(s => s.ticker === position.ticker);
      if (!stock) continue;

      const currentValue = position.shares * stock.current_price;
      const profitLoss = currentValue - position.total_invested;
      const profitLossPercent = (profitLoss / position.total_invested) * 100;

      byPosition.push({
        ticker: position.ticker,
        profitLoss,
        profitLossPercent,
      });

      totalProfitLoss += profitLoss;
      totalInvested += position.total_invested;
    }

    const totalPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

    return {
      total: totalProfitLoss,
      totalPercent,
      byPosition,
    };
  }

  // ============================================
  // WHALE TRANSACTION CHECK
  // ============================================

  private async checkWhaleTransaction(user: UserProfileRow, amount: number): Promise<void> {
    if (amount >= FINANCIAL_CONFIG.WHALE_TRACKER_THRESHOLD) {
      // Notify users with Whale Tracker
      const users = await userProfileQueries.getAll();

      for (const u of users) {
        const hasWhaleTracker = await inventoryQueries.hasActivePass(
          u.id,
          SHOP_ITEM_TYPES.WHALE_TRACKER_SUBSCRIPTION
        );

        if (hasWhaleTracker && u.id !== user.id) {
          await inventoryQueries.create({
            user_id: u.id,
            shop_item_id: '',
            item_id: SHOP_ITEM_TYPES.WHALE_TRACKER_SUBSCRIPTION,
            quantity: 1,
            purchased_at: new Date(),
            last_used_at: null,
            uses_remaining: null,
            is_active: true,
            expires_at: null,
            metadata: {
              whaleAlert: true,
              userId: user.id,
              username: user.username,
              amount,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    }
  }

  // ============================================
  // ATTACH STOP-LOSS
  // ============================================

  async attachStopLoss(
    userId: string,
    ticker: string,
    stopLossPrice: number
  ): Promise<{ success: boolean; error?: string }> {
    const position = await portfolioQueries.getByUserIdAndTicker(userId, ticker);
    if (!position) {
      return { success: false, error: 'Position not found' };
    }

    const stock = await stockQueries.getByTicker(ticker);
    if (!stock) {
      return { success: false, error: 'Stock not found' };
    }

    if (stopLossPrice >= stock.current_price) {
      return { success: false, error: 'Stop-loss price must be below current price' };
    }

    await portfolioQueries.update(position.id, {
      stop_loss_price: stopLossPrice,
    });

    return { success: true };
  }

  // ============================================
  // REMOVE STOP-LOSS
  // ============================================

  async removeStopLoss(
    userId: string,
    ticker: string
  ): Promise<{ success: boolean; error?: string }> {
    const position = await portfolioQueries.getByUserIdAndTicker(userId, ticker);
    if (!position) {
      return { success: false, error: 'Position not found' };
    }

    await portfolioQueries.update(position.id, {
      stop_loss_price: null,
      stop_loss_contract_id: null,
    });

    return { success: true };
  }
}

// Singleton instance
export const portfolioService = new PortfolioService();
