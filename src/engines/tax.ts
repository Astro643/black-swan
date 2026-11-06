import { FINANCIAL_CONFIG } from '../config';
import {
  userProfileQueries,
  transactionQueries,
  notificationQueries,
  inventoryQueries,
} from '../db/client';
import { UserProfileRow } from '../db/types';
import { SHOP_ITEM_TYPES } from '../config';

// ============================================
// TAX ENGINE
// ============================================

interface TaxEngineOptions {
  taxIntervalMs?: number;
  onError?: (error: Error) => void;
}

export class TaxEngine {
  private taxInterval: NodeJS.Timeout | null = null;
  private options: TaxEngineOptions;
  private isRunning: boolean = false;
  private lastTaxAt: Date | null = null;

  constructor(options: TaxEngineOptions = {}) {
    this.options = {
      taxIntervalMs: FINANCIAL_CONFIG.TAX_INTERVAL_MS,
      onError: (error) => console.error('Tax Engine Error:', error),
      ...options,
    };
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Tax Engine started');
    
    // Initial tax check
    this.checkAndApplyTaxes().catch(this.options.onError);
    
    // Schedule regular tax checks
    this.taxInterval = setInterval(
      () => this.checkAndApplyTaxes().catch(this.options.onError),
      this.options.taxIntervalMs
    );
  }

  stop(): void {
    if (!this.isRunning) return;
    
    if (this.taxInterval) {
      clearInterval(this.taxInterval);
      this.taxInterval = null;
    }
    this.isRunning = false;
    console.log('Tax Engine stopped');
  }

  restart(): void {
    this.stop();
    this.start();
  }

  // ============================================
  // TAX LOGIC
  // ============================================

  private async checkAndApplyTaxes(): Promise<void> {
    this.lastTaxAt = new Date();
    
    try {
      const users = await userProfileQueries.getAll();
      
      for (const user of users) {
        // Skip users with Tax Haven Registration
        const hasTaxHaven = await inventoryQueries.hasActivePass(
          user.id,
          SHOP_ITEM_TYPES.TAX_HAVEN_REGISTRATION
        );
        
        if (hasTaxHaven) {
          console.log(`User ${user.username} has Tax Haven - skipping tax`);
          continue;
        }
        
        // Check if user has been taxed recently
        if (user.last_tax_at) {
          const hoursSinceTax = (this.lastTaxAt.getTime() - user.last_tax_at.getTime()) / (1000 * 60 * 60);
          if (hoursSinceTax < 24) {
            continue;
          }
        }
        
        // Apply progressive tax if cash > $1,000,000
        if (user.cash > FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD) {
          await this.applyHyperWealthTax(user);
        }
      }
      
      console.log(`Tax check completed at ${this.lastTaxAt.toISOString()}`);
    } catch (error) {
      console.error('Tax check error:', error);
      throw error;
    }
  }

  private async applyHyperWealthTax(user: UserProfileRow): Promise<void> {
    const taxableAmount = user.cash - FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD;
    const taxAmount = taxableAmount * FINANCIAL_CONFIG.HYPER_WEALTH_TAX_RATE;
    
    // Deduct tax from cash
    const newCash = user.cash - taxAmount;
    
    await userProfileQueries.update(user.id, {
      cash: newCash,
      last_tax_at: new Date(),
      net_worth: user.net_worth - taxAmount,
    });
    
    // Log transaction
    await transactionQueries.create({
      user_id: user.id,
      transaction_type: 'TAX',
      ticker: null,
      shares: null,
      price: null,
      amount: taxAmount,
      fee: 0,
      balance_after: newCash,
      metadata: {
        taxRate: FINANCIAL_CONFIG.HYPER_WEALTH_TAX_RATE,
        threshold: FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD,
        taxableAmount,
      },
    });
    
    // Create notification
    await notificationQueries.create({
      user_id: user.id,
      notification_type: 'TAX_PAID',
      title: 'Hyper-Wealth Tax Applied',
      message: `You have been taxed $${taxAmount.toFixed(2)} (${(FINANCIAL_CONFIG.HYPER_WEALTH_TAX_RATE * 100).toFixed(0)}% of cash above $${FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD.toLocaleString()}). Remaining cash: $${newCash.toFixed(2)}`,
      metadata: { taxAmount, taxRate: FINANCIAL_CONFIG.HYPER_WEALTH_TAX_RATE },
    });
    
    console.log(`Tax applied to ${user.username}: $${taxAmount.toFixed(2)}`);
  }

  // ============================================
  // TAX CALCULATION UTILITIES
  // ============================================

  async calculateTaxForUser(userId: string): Promise<{ taxAmount: number; taxableAmount: number }> {
    const user = await userProfileQueries.getById(userId);
    if (!user) return { taxAmount: 0, taxableAmount: 0 };
    
    // Check for Tax Haven
    const hasTaxHaven = await inventoryQueries.hasActivePass(
      user.id,
      SHOP_ITEM_TYPES.TAX_HAVEN_REGISTRATION
    );
    
    if (hasTaxHaven) {
      return { taxAmount: 0, taxableAmount: 0 };
    }
    
    if (user.cash <= FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD) {
      return { taxAmount: 0, taxableAmount: 0 };
    }
    
    const taxableAmount = user.cash - FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD;
    const taxAmount = taxableAmount * FINANCIAL_CONFIG.HYPER_WEALTH_TAX_RATE;
    
    return { taxAmount, taxableAmount };
  }

  async getTaxStatus(userId: string): Promise<{
    hasTaxHaven: boolean;
    cash: number;
    threshold: number;
    taxableAmount: number;
    nextTaxAt?: Date;
  }> {
    const user = await userProfileQueries.getById(userId);
    if (!user) {
      return {
        hasTaxHaven: false,
        cash: 0,
        threshold: FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD,
        taxableAmount: 0,
      };
    }
    
    const hasTaxHaven = await inventoryQueries.hasActivePass(
      user.id,
      SHOP_ITEM_TYPES.TAX_HAVEN_REGISTRATION
    );
    
    const taxableAmount = Math.max(0, user.cash - FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD);
    
    let nextTaxAt: Date | undefined;
    if (user.last_tax_at) {
      nextTaxAt = new Date(user.last_tax_at.getTime() + FINANCIAL_CONFIG.TAX_INTERVAL_MS);
    } else {
      nextTaxAt = new Date(Date.now() + FINANCIAL_CONFIG.TAX_INTERVAL_MS);
    }
    
    return {
      hasTaxHaven,
      cash: user.cash,
      threshold: FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD,
      taxableAmount,
      nextTaxAt,
    };
  }

  async forceApplyTax(userId: string): Promise<{ success: boolean; error?: string; taxAmount?: number; newCash?: number }> {
    const user = await userProfileQueries.getById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    // Check for Tax Haven
    const hasTaxHaven = await inventoryQueries.hasActivePass(
      user.id,
      SHOP_ITEM_TYPES.TAX_HAVEN_REGISTRATION
    );
    
    if (hasTaxHaven) {
      return { success: false, error: 'User has Tax Haven Registration' };
    }
    
    if (user.cash <= FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD) {
      return { success: false, error: 'User does not meet tax threshold' };
    }
    
    const taxableAmount = user.cash - FINANCIAL_CONFIG.HYPER_WEALTH_TAX_THRESHOLD;
    const taxAmount = taxableAmount * FINANCIAL_CONFIG.HYPER_WEALTH_TAX_RATE;
    const newCash = user.cash - taxAmount;
    
    await userProfileQueries.update(user.id, {
      cash: newCash,
      last_tax_at: new Date(),
      net_worth: user.net_worth - taxAmount,
    });
    
    await transactionQueries.create({
      user_id: user.id,
      transaction_type: 'TAX',
      ticker: null,
      shares: null,
      price: null,
      amount: taxAmount,
      fee: 0,
      balance_after: newCash,
      metadata: { forced: true },
    });
    
    return { success: true, taxAmount, newCash };
  }
}

// Singleton instance
export const taxEngine = new TaxEngine();
