import {
  MARKET_CONFIG,
  FINANCIAL_CONFIG,
  STOCK_CATEGORIES,
  SHOP_ITEM_TYPES,
} from '../config';
import {
  stockQueries,
  portfolioQueries,
  transactionQueries,
  inventoryQueries,
  marketEventQueries,
  manipulationQueueQueries,
  userProfileQueries,
  notificationQueries,
} from '../db/client';
import { StockRow, PortfolioRow, UserProfileRow, InventoryRow } from '../db/types';

// ============================================
// MARKET ENGINE
// ============================================

interface MarketEngineOptions {
  tickIntervalMs?: number;
  onError?: (error: Error) => void;
}

interface PriceUpdateResult {
  ticker: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number;
  isManipulated: boolean;
  manipulationType: 'PUMP' | 'DUMP' | null;
}

interface BlackSwanResult {
  triggered: boolean;
  eventType: 'BLACK_SWAN_TECH' | 'BLACK_SWAN_MEME' | null;
  affectedTickers: string[];
  goldNewPrice: number | null;
}

export class MarketEngine {
  private tickInterval: NodeJS.Timeout | null = null;
  private options: MarketEngineOptions;
  private isRunning: boolean = false;
  private lastTickAt: Date | null = null;

  constructor(options: MarketEngineOptions = {}) {
    this.options = {
      tickIntervalMs: MARKET_CONFIG.TICK_INTERVAL_MS,
      onError: (error) => console.error('Market Engine Error:', error),
      ...options,
    };
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Market Engine started');
    
    // Initial tick
    this.tick().catch(this.options.onError);
    
    // Schedule regular ticks
    this.tickInterval = setInterval(
      () => this.tick().catch(this.options.onError),
      this.options.tickIntervalMs
    );
  }

  stop(): void {
    if (!this.isRunning) return;
    
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.isRunning = false;
    console.log('Market Engine stopped');
  }

  restart(): void {
    this.stop();
    this.start();
  }

  // ============================================
  // CORE TICK LOGIC
  // ============================================

  private async tick(): Promise<void> {
    this.lastTickAt = new Date();
    
    try {
      // 1. Check for Black Swan event
      const blackSwanResult = await this.checkBlackSwan();
      if (blackSwanResult.triggered) {
        await this.executeBlackSwan(blackSwanResult);
      }
      
      // 2. Process manipulation queue
      await this.processManipulationQueue();
      
      // 3. Update all stock prices
      const priceUpdates = await this.updateStockPrices();
      
      // 4. Check and execute stop-loss orders
      await this.checkStopLosses(priceUpdates);
      
      // 5. Update user net worth based on portfolio values
      await this.updateUserNetWorth();
      
      // 6. Log market events
      await this.logMarketEvents(priceUpdates, blackSwanResult);
      
      // 7. Cleanup old manipulation queue entries
      await manipulationQueueQueries.cleanupOld();
      
      console.log(`Market tick completed at ${this.lastTickAt.toISOString()}`);
      console.log(`Price updates: ${priceUpdates.length}, Black Swan: ${blackSwanResult.triggered ? 'YES' : 'NO'}`);
    } catch (error) {
      console.error('Market tick error:', error);
      throw error;
    }
  }

  // ============================================
  // BLACK SWAN LOGIC
  // ============================================

  private async checkBlackSwan(): Promise<BlackSwanResult> {
    // 2% chance per hour
    const random = Math.random();
    const shouldTrigger = random < MARKET_CONFIG.BLACK_SWAN_CHANCE;
    
    if (!shouldTrigger) {
      return { triggered: false, eventType: null, affectedTickers: [], goldNewPrice: null };
    }
    
    // Randomly choose between TECH or MEME crash
    const isTechCrash = Math.random() < 0.5;
    const eventType = isTechCrash ? 'BLACK_SWAN_TECH' : 'BLACK_SWAN_MEME';
    const affectedTickers = isTechCrash 
      ? STOCK_CATEGORIES.TECH 
      : STOCK_CATEGORIES.MEME;
    
    return {
      triggered: true,
      eventType,
      affectedTickers,
      goldNewPrice: null, // Will be calculated in executeBlackSwan
    };
  }

  private async executeBlackSwan(result: BlackSwanResult): Promise<void> {
    if (!result.triggered) return;
    
    const { eventType, affectedTickers } = result;
    const crashMultiplier = 1 - (0.6 + Math.random() * 0.2); // 60-80% crash
    const goldBoostMultiplier = MARKET_CONFIG.BLACK_SWAN_GOLD_BOOST;
    
    // Get all stocks
    const allStocks = await stockQueries.getAllActive();
    
    // Update affected stocks
    for (const ticker of affectedTickers) {
      const stock = allStocks.find(s => s.ticker === ticker);
      if (stock) {
        const newPrice = stock.current_price * crashMultiplier;
        await stockQueries.updatePrice(stock.id, newPrice);
        
        // Log Black Swan event for this stock
        await marketEventQueries.create({
          event_type: 'BLACK_SWAN',
          ticker: stock.ticker,
          old_price: stock.current_price,
          new_price: newPrice,
          change_percent: (newPrice - stock.current_price) / stock.current_price * 100,
          category: stock.category,
          triggered_by: 'SYSTEM',
          metadata: { eventType, crashMultiplier },
        });
      }
    }
    
    // Boost GOLD
    const goldStock = allStocks.find(s => s.ticker === 'GOLD');
    if (goldStock) {
      const newPrice = goldStock.current_price * goldBoostMultiplier;
      await stockQueries.updatePrice(goldStock.id, newPrice);
      
      result.goldNewPrice = newPrice;
      
      await marketEventQueries.create({
        event_type: 'BLACK_SWAN',
        ticker: 'GOLD',
        old_price: goldStock.current_price,
        new_price: newPrice,
        change_percent: (newPrice - goldStock.current_price) / goldStock.current_price * 100,
        category: 'SAFE_HAVEN',
        triggered_by: 'SYSTEM',
        metadata: { eventType: `${eventType}_GOLD_BOOST`, boostMultiplier: goldBoostMultiplier },
      });
    }
    
    // Process bailout bonds
    await this.processBailoutBonds(eventType, affectedTickers);
    
    // Send notifications to users with Whale Tracker
    await this.notifyWhaleTrackers(eventType, affectedTickers);
  }

  private async processBailoutBonds(eventType: string, affectedTickers: string[]): Promise<void> {
    // Get all users with Bailout Bond
    const users = await userProfileQueries.getAll();
    
    for (const user of users) {
      const hasBailoutBond = await inventoryQueries.hasActivePass(user.id, SHOP_ITEM_TYPES.BAILOUT_BOND);
      if (!hasBailoutBond) continue;
      
      // Calculate net worth loss from the crash
      const portfolio = await portfolioQueries.getByUserId(user.id);
      let lossAmount = 0;
      
      for (const position of portfolio) {
        if (affectedTickers.includes(position.ticker)) {
          const stock = await stockQueries.getByTicker(position.ticker);
          if (stock) {
            // The position value has dropped
            const originalValue = position.shares * (stock.current_price / (1 - 0.7)); // Approximate
            const newValue = position.shares * stock.current_price;
            lossAmount += originalValue - newValue;
          }
        }
      }
      
      // 50% reimbursement
      const reimbursement = lossAmount * FINANCIAL_CONFIG.BAILOUT_BOND_REIMBURSEMENT;
      
      if (reimbursement > 0) {
        // Add cash to user
        await userProfileQueries.updateCash(user.id, reimbursement, 'BAILOUT_BOND');
        
        // Log transaction
        await transactionQueries.create({
          user_id: user.id,
          transaction_type: 'BAILOUT',
          ticker: null,
          shares: null,
          price: null,
          amount: reimbursement,
          fee: 0,
          balance_after: (await userProfileQueries.getById(user.id))?.cash ?? 0,
          metadata: { eventType, lossAmount, reimbursementRate: FINANCIAL_CONFIG.BAILOUT_BOND_REIMBURSEMENT },
        });
        
        // Create notification
        await notificationQueries.create({
          user_id: user.id,
          notification_type: 'BAILOUT_ACTIVATED',
          title: 'Bailout Bond Activated',
          message: `You received $${reimbursement.toFixed(2)} from your Bailout Bond due to the ${eventType} crash.`,
          metadata: { reimbursement, eventType },
        });
      }
    }
  }

  // ============================================
  // PRICE UPDATE LOGIC
  // ============================================

  private async updateStockPrices(): Promise<PriceUpdateResult[]> {
    const allStocks = await stockQueries.getAllActive();
    const results: PriceUpdateResult[] = [];
    
    for (const stock of allStocks) {
      const result = await this.updateStockPrice(stock);
      results.push(result);
    }
    
    return results;
  }

  private async updateStockPrice(stock: StockRow): Promise<PriceUpdateResult> {
    // Check if stock is manipulated
    if (stock.is_manipulated && stock.manipulated_type) {
      return await this.handleManipulatedPrice(stock);
    }
    
    // Normal price update
    const randomSwing = MARKET_CONFIG.RANDOM_SWING_RANGE.min + 
      Math.random() * (MARKET_CONFIG.RANDOM_SWING_RANGE.max - MARKET_CONFIG.RANDOM_SWING_RANGE.min);
    
    const volatility = stock.base_volatility;
    const priceChange = 1 + (randomSwing * volatility);
    const newPrice = stock.current_price * priceChange;
    
    // Ensure price doesn't go negative
    const finalPrice = Math.max(newPrice, 0.01);
    
    await stockQueries.updatePrice(stock.id, finalPrice);
    
    const changePercent = ((finalPrice - stock.current_price) / stock.current_price) * 100;
    
    return {
      ticker: stock.ticker,
      oldPrice: stock.current_price,
      newPrice: finalPrice,
      changePercent,
      isManipulated: false,
      manipulationType: null,
    };
  }

  private async handleManipulatedPrice(stock: StockRow): Promise<PriceUpdateResult> {
    const { manipulated_type, manipulated_by } = stock;
    
    if (!manipulated_type) {
      return this.updateStockPrice(stock);
    }
    
    let newPrice: number;
    let manipulationType: 'PUMP' | 'DUMP' | null = null;
    
    if (manipulated_type === 'PUMP') {
      newPrice = stock.current_price * (1 + MARKET_CONFIG.MANIPULATED_PRICE_CHANGE);
      manipulationType = 'PUMP';
    } else {
      newPrice = stock.current_price * (1 - MARKET_CONFIG.MANIPULATED_PRICE_CHANGE);
      manipulationType = 'DUMP';
    }
    
    await stockQueries.updatePrice(stock.id, newPrice);
    
    // Clear manipulation flag after execution
    await stockQueries.updateManipulation(
      stock.id,
      false,
      null,
      null,
      null
    );
    
    const changePercent = ((newPrice - stock.current_price) / stock.current_price) * 100;
    
    // Log manipulation event
    await marketEventQueries.create({
      event_type: 'MANIPULATION',
      ticker: stock.ticker,
      old_price: stock.current_price,
      new_price: newPrice,
      change_percent: changePercent,
      category: stock.category,
      triggered_by: manipulated_by || 'SYSTEM',
      metadata: { manipulationType },
    });
    
    return {
      ticker: stock.ticker,
      oldPrice: stock.current_price,
      newPrice,
      changePercent,
      isManipulated: true,
      manipulationType,
    };
  }

  // ============================================
  // MANIPULATION QUEUE PROCESSING
  // ============================================

  private async processManipulationQueue(): Promise<void> {
    const pendingManipulations = await manipulationQueueQueries.getPending();
    
    for (const manipulation of pendingManipulations) {
      const stock = await stockQueries.getByTicker(manipulation.ticker);
      if (!stock) continue;
      
      // Mark stock as manipulated
      await stockQueries.updateManipulation(
        stock.id,
        true,
        manipulation.discord_id,
        manipulation.manipulation_type,
        new Date()
      );
      
      // Mark manipulation as executed
      await manipulationQueueQueries.markAsExecuted(manipulation.id);
      
      // Consume the item from inventory
      const inventoryItem = await inventoryQueries.getByUserIdAndItemId(
        manipulation.user_id,
        manipulation.manipulation_type === 'PUMP' ? SHOP_ITEM_TYPES.PUMP_CARD : SHOP_ITEM_TYPES.DUMP_CARD
      );
      
      if (inventoryItem) {
        await inventoryQueries.consume(inventoryItem.id);
      }
    }
  }

  // ============================================
  // STOP-LOSS LOGIC
  // ============================================

  private async checkStopLosses(priceUpdates: PriceUpdateResult[]): Promise<void> {
    // Get all active stop-loss contracts
    const allPortfolios = await portfolioQueries.getAll();
    
    for (const position of allPortfolios) {
      if (!position.stop_loss_price || !position.stop_loss_contract_id) continue;
      
      const priceUpdate = priceUpdates.find(p => p.ticker === position.ticker);
      if (!priceUpdate) continue;
      
      // Check if price dropped below stop-loss threshold
      if (priceUpdate.newPrice <= position.stop_loss_price) {
        await this.executeStopLoss(position, priceUpdate);
      }
    }
  }

  private async executeStopLoss(position: PortfolioRow, priceUpdate: PriceUpdateResult): Promise<void> {
    const user = await userProfileQueries.getById(position.user_id);
    if (!user) return;
    
    const stock = await stockQueries.getByTicker(position.ticker);
    if (!stock) return;
    
    // Sell all shares at the stop-loss price
    const sellAmount = position.shares * position.stop_loss_price;
    
    // Remove from portfolio
    await portfolioQueries.delete(position.id);
    
    // Add cash to user
    await userProfileQueries.updateCash(user.id, sellAmount, 'STOP_LOSS');
    
    // Log transaction
    await transactionQueries.create({
      user_id: user.id,
      transaction_type: 'STOP_LOSS',
      ticker: position.ticker,
      shares: position.shares,
      price: position.stop_loss_price,
      amount: sellAmount,
      fee: 0,
      balance_after: (await userProfileQueries.getById(user.id))?.cash ?? 0,
      metadata: {
        originalAveragePrice: position.average_price,
        stopLossContractId: position.stop_loss_contract_id,
      },
    });
    
    // Consume the stop-loss contract
    const inventoryItem = await inventoryQueries.getById(position.stop_loss_contract_id);
    if (inventoryItem) {
      await inventoryQueries.consume(inventoryItem.id);
    }
    
    // Create notification
    await notificationQueries.create({
      user_id: user.id,
      notification_type: 'STOP_LOSS_TRIGGERED',
      title: 'Stop-Loss Triggered',
      message: `Your stop-loss for ${position.ticker} was triggered at $${position.stop_loss_price.toFixed(2)}. Sold ${position.shares} shares for $${sellAmount.toFixed(2)}.`,
      metadata: { ticker: position.ticker, shares: position.shares, price: position.stop_loss_price },
    });
    
    console.log(`Stop-loss executed for ${user.username} on ${position.ticker}`);
  }

  // ============================================
  // NET WORTH UPDATE
  // ============================================

  private async updateUserNetWorth(): Promise<void> {
    const users = await userProfileQueries.getAll();
    
    for (const user of users) {
      const portfolio = await portfolioQueries.getByUserId(user.id);
      const stocks = await stockQueries.getAllActive();
      
      let portfolioValue = 0;
      for (const position of portfolio) {
        const stock = stocks.find(s => s.ticker === position.ticker);
        if (stock) {
          portfolioValue += position.shares * stock.current_price;
        }
      }
      
      const newNetWorth = user.cash + portfolioValue - user.loan_amount;
      
      if (Math.abs(newNetWorth - user.net_worth) > 0.01) {
        await userProfileQueries.update(user.id, { net_worth: newNetWorth });
      }
    }
  }

  // ============================================
  // NOTIFICATION LOGIC
  // ============================================

  private async notifyWhaleTrackers(eventType: string, affectedTickers: string[]): Promise<void> {
    const users = await userProfileQueries.getAll();
    
    for (const user of users) {
      const hasWhaleTracker = await inventoryQueries.hasActivePass(
        user.id,
        SHOP_ITEM_TYPES.WHALE_TRACKER_SUBSCRIPTION
      );
      
      if (hasWhaleTracker) {
        await notificationQueries.create({
          user_id: user.id,
          notification_type: 'MARKET_CRASH',
          title: `Black Swan Event: ${eventType}`,
          message: `A Black Swan event has occurred! ${eventType.replace('_', ' ')} stocks have crashed by 60-80%.`,
          metadata: { eventType, affectedTickers },
        });
      }
    }
  }

  // ============================================
  // MARKET EVENT LOGGING
  // ============================================

  private async logMarketEvents(
    priceUpdates: PriceUpdateResult[],
    blackSwanResult: BlackSwanResult
  ): Promise<void> {
    for (const update of priceUpdates) {
      if (!update.isManipulated && Math.abs(update.changePercent) > 1) {
        await marketEventQueries.create({
          event_type: 'PRICE_UPDATE',
          ticker: update.ticker,
          old_price: update.oldPrice,
          new_price: update.newPrice,
          change_percent: update.changePercent,
          triggered_by: 'SYSTEM',
        });
      }
    }
    
    if (blackSwanResult.triggered) {
      await marketEventQueries.create({
        event_type: 'BLACK_SWAN',
        ticker: null,
        category: blackSwanResult.eventType,
        triggered_by: 'SYSTEM',
        metadata: {
          affectedTickers: blackSwanResult.affectedTickers,
          goldNewPrice: blackSwanResult.goldNewPrice,
        },
      });
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  async getStockPrice(ticker: string): Promise<number | null> {
    const stock = await stockQueries.getByTicker(ticker);
    return stock?.current_price ?? null;
  }

  async getStockInfo(ticker: string): Promise<StockRow | null> {
    return stockQueries.getByTicker(ticker);
  }

  async getAllStockPrices(): Promise<Record<string, number>> {
    const stocks = await stockQueries.getAllActive();
    const prices: Record<string, number> = {};
    for (const stock of stocks) {
      prices[stock.ticker] = stock.current_price;
    }
    return prices;
  }

  async revealBaseVolatility(ticker: string): Promise<number | null> {
    const stock = await stockQueries.getByTicker(ticker);
    return stock?.base_volatility ?? null;
  }

  async scheduleManipulation(
    userId: string,
    discordId: string,
    ticker: string,
    manipulationType: 'PUMP' | 'DUMP'
  ): Promise<void> {
    // Schedule for next tick (immediate execution in next cycle)
    const scheduledFor = new Date(Date.now() + 1000); // 1 second from now
    
    await manipulationQueueQueries.create({
      user_id: userId,
      discord_id: discordId,
      ticker,
      manipulation_type: manipulationType,
      amount: MARKET_CONFIG.MANIPULATED_PRICE_CHANGE,
      scheduled_for: scheduledFor,
    });
  }

  async isStockManipulated(ticker: string): Promise<boolean> {
    const stock = await stockQueries.getByTicker(ticker);
    return stock?.is_manipulated ?? false;
  }
}

// Singleton instance
export const marketEngine = new MarketEngine();
