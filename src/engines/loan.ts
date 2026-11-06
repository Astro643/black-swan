import { FINANCIAL_CONFIG } from '../config';
import {
  userProfileQueries,
  loanQueries,
  transactionQueries,
  portfolioQueries,
  notificationQueries,
  inventoryQueries,
} from '../db/client';
import { UserProfileRow, LoanRow } from '../db/types';
import { SHOP_ITEM_TYPES } from '../config';

// ============================================
// LOAN ENGINE
// ============================================

interface LoanEngineOptions {
  interestIntervalMs?: number;
  onError?: (error: Error) => void;
}

export class LoanEngine {
  private interestInterval: NodeJS.Timeout | null = null;
  private options: LoanEngineOptions;
  private isRunning: boolean = false;

  constructor(options: LoanEngineOptions = {}) {
    this.options = {
      interestIntervalMs: 60 * 60 * 1000, // 1 hour
      onError: (error) => console.error('Loan Engine Error:', error),
      ...options,
    };
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Loan Engine started');
    
    // Initial interest check
    this.checkAndApplyInterest().catch(this.options.onError);
    
    // Schedule regular interest checks
    this.interestInterval = setInterval(
      () => this.checkAndApplyInterest().catch(this.options.onError),
      this.options.interestIntervalMs
    );
  }

  stop(): void {
    if (!this.isRunning) return;
    
    if (this.interestInterval) {
      clearInterval(this.interestInterval);
      this.interestInterval = null;
    }
    this.isRunning = false;
    console.log('Loan Engine stopped');
  }

  restart(): void {
    this.stop();
    this.start();
  }

  // ============================================
  // INTEREST LOGIC
  // ============================================

  private async checkAndApplyInterest(): Promise<void> {
    try {
      const activeLoans = await loanQueries.getAll();
      
      for (const loan of activeLoans) {
        if (!loan.is_active) continue;
        
        // Check if interest should be applied
        const user = await userProfileQueries.getById(loan.user_id);
        if (!user) continue;
        
        // Calculate time since last interest
        const now = new Date();
        const lastInterestAt = user.last_interest_at || loan.taken_at;
        const hoursPassed = (now.getTime() - lastInterestAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursPassed >= 1) {
          await this.applyInterest(loan, user, hoursPassed);
        }
      }
      
      // Check for liquidations
      await this.checkLiquidations();
      
      console.log(`Interest check completed at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Interest check error:', error);
      throw error;
    }
  }

  private async applyInterest(loan: LoanRow, user: UserProfileRow, hoursPassed: number): Promise<void> {
    // Calculate interest for each hour passed
    const interestPerHour = loan.amount * FINANCIAL_CONFIG.LOAN_INTEREST_RATE;
    const totalInterest = interestPerHour * hoursPassed;
    
    // Update user's loan amount
    const newLoanAmount = loan.amount + totalInterest;
    
    // Update user profile
    await userProfileQueries.update(user.id, {
      loan_amount: newLoanAmount,
      last_interest_at: new Date(),
    });
    
    // Update loan record
    await loanQueries.update(loan.id, {
      amount: newLoanAmount,
      total_interest_paid: loan.total_interest_paid + totalInterest,
    });
    
    // Log transaction
    await transactionQueries.create({
      user_id: user.id,
      transaction_type: 'INTEREST',
      ticker: null,
      shares: null,
      price: null,
      amount: totalInterest,
      fee: 0,
      balance_after: user.cash,
      metadata: { loanId: loan.id, hoursPassed, interestRate: FINANCIAL_CONFIG.LOAN_INTEREST_RATE },
    });
    
    // Create notification
    await notificationQueries.create({
      user_id: user.id,
      notification_type: 'LOAN_DUE',
      title: 'Loan Interest Applied',
      message: `Interest of $${totalInterest.toFixed(2)} has been added to your loan. Total loan: $${newLoanAmount.toFixed(2)}`,
      metadata: { interest: totalInterest, newLoanAmount },
    });
  }

  // ============================================
  // LIQUIDATION LOGIC
  // ============================================

  private async checkLiquidations(): Promise<void> {
    const users = await userProfileQueries.getAll();
    
    for (const user of users) {
      if (user.is_liquidated) continue;
      
      const activeLoan = await loanQueries.getActiveByUserId(user.id);
      if (!activeLoan) continue;
      
      // Calculate net worth
      const portfolio = await portfolioQueries.getByUserId(user.id);
      const stocks = await portfolioQueries.getAll();
      
      let portfolioValue = 0;
      for (const position of portfolio) {
        const stock = stocks.find(s => s.ticker === position.ticker);
        if (stock) {
          portfolioValue += position.shares * stock.current_price;
        }
      }
      
      const netWorth = user.cash + portfolioValue;
      const loanToValueRatio = activeLoan.amount / netWorth;
      
      // Liquidate if loan exceeds 100% of net worth or if unpaid for too long
      const hoursSinceLoan = (new Date().getTime() - activeLoan.taken_at.getTime()) / (1000 * 60 * 60);
      const shouldLiquidate = 
        loanToValueRatio > 1 || 
        hoursSinceLoan >= FINANCIAL_CONFIG.LOAN_LIQUIDATION_HOURS;
      
      if (shouldLiquidate) {
        await this.liquidateUser(user, activeLoan);
      }
    }
  }

  private async liquidateUser(user: UserProfileRow, loan: LoanRow): Promise<void> {
    console.log(`Liquidating user ${user.username} (${user.id})`);
    
    // Sell all portfolio positions
    const portfolio = await portfolioQueries.getByUserId(user.id);
    const stocks = await portfolioQueries.getAll();
    
    let liquidationValue = 0;
    
    for (const position of portfolio) {
      const stock = stocks.find(s => s.ticker === position.ticker);
      if (stock) {
        const sellValue = position.shares * stock.current_price;
        liquidationValue += sellValue;
        
        // Delete portfolio position
        await portfolioQueries.delete(position.id);
        
        // Log transaction
        await transactionQueries.create({
          user_id: user.id,
          transaction_type: 'LIQUIDATION',
          ticker: position.ticker,
          shares: position.shares,
          price: stock.current_price,
          amount: sellValue,
          fee: 0,
          balance_after: user.cash,
          metadata: { liquidation: true },
        });
      }
    }
    
    // Pay off as much of the loan as possible
    const remainingLoan = loan.amount - liquidationValue;
    
    if (remainingLoan <= 0) {
      // Loan is fully covered
      await userProfileQueries.update(user.id, {
        cash: user.cash + (liquidationValue - loan.amount),
        loan_amount: 0,
        is_liquidated: true,
      });
      
      await loanQueries.markAsInactive(loan.id);
    } else {
      // Partial payment
      await userProfileQueries.update(user.id, {
        cash: 0,
        loan_amount: remainingLoan,
        is_liquidated: true,
      });
      
      await loanQueries.update(loan.id, {
        amount: remainingLoan,
        is_active: false,
      });
    }
    
    // Create notification
    await notificationQueries.create({
      user_id: user.id,
      notification_type: 'LIQUIDATION',
      title: 'Account Liquidated',
      message: `Your account has been liquidated. Portfolio sold for $${liquidationValue.toFixed(2)}. Remaining debt: $${Math.max(remainingLoan, 0).toFixed(2)}`,
      metadata: { liquidationValue, remainingLoan },
    });
    
    console.log(`User ${user.username} liquidated. Value: $${liquidationValue.toFixed(2)}, Remaining: $${Math.max(remainingLoan, 0).toFixed(2)}`);
  }

  // ============================================
  // LOAN MANAGEMENT METHODS
  // ============================================

  async takeLoan(userId: string, amount: number): Promise<{ success: boolean; error?: string; loan?: LoanRow; newLoanAmount?: number }> {
    const user = await userProfileQueries.getById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    // Check if user already has an active loan
    const activeLoan = await loanQueries.getActiveByUserId(userId);
    if (activeLoan) {
      return { success: false, error: 'You already have an active loan' };
    }
    
    // Calculate max loan amount (50% of net worth)
    const portfolio = await portfolioQueries.getByUserId(userId);
    const stocks = await portfolioQueries.getAll();
    
    let portfolioValue = 0;
    for (const position of portfolio) {
      const stock = stocks.find(s => s.ticker === position.ticker);
      if (stock) {
        portfolioValue += position.shares * stock.current_price;
      }
    }
    
    const netWorth = user.cash + portfolioValue;
    const maxLoan = netWorth * FINANCIAL_CONFIG.LOAN_MAX_PERCENTAGE;
    
    if (amount > maxLoan) {
      return { success: false, error: `Maximum loan amount is $${maxLoan.toFixed(2)}` };
    }
    
    if (amount <= 0) {
      return { success: false, error: 'Loan amount must be positive' };
    }
    
    // Create loan
    const loan = await loanQueries.create({
      user_id: userId,
      amount,
      interest_rate: FINANCIAL_CONFIG.LOAN_INTEREST_RATE,
      taken_at: new Date(),
      due_at: new Date(Date.now() + FINANCIAL_CONFIG.LOAN_LIQUIDATION_HOURS * 60 * 60 * 1000),
      is_active: true,
    });
    
    // Update user
    const newLoanAmount = user.loan_amount + amount;
    await userProfileQueries.update(user.id, {
      cash: user.cash + amount,
      loan_amount: newLoanAmount,
      loan_taken_at: new Date(),
      last_interest_at: new Date(),
      net_worth: netWorth + amount,
    });
    
    // Log transaction
    await transactionQueries.create({
      user_id: userId,
      transaction_type: 'LOAN_TAKE',
      ticker: null,
      shares: null,
      price: null,
      amount,
      fee: 0,
      balance_after: user.cash + amount,
      metadata: { loanId: loan.id },
    });
    
    // Create notification
    await notificationQueries.create({
      user_id: userId,
      notification_type: 'LOAN_DUE',
      title: 'Loan Taken',
      message: `You have taken a loan of $${amount.toFixed(2)}. Interest rate: ${(FINANCIAL_CONFIG.LOAN_INTEREST_RATE * 100).toFixed(0)}% per hour.`,
      metadata: { amount, interestRate: FINANCIAL_CONFIG.LOAN_INTEREST_RATE },
    });
    
    return { success: true, loan, newLoanAmount };
  }

  async repayLoan(userId: string, amount: number): Promise<{ success: boolean; error?: string; newLoanAmount?: number }> {
    const user = await userProfileQueries.getById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    const activeLoan = await loanQueries.getActiveByUserId(userId);
    if (!activeLoan) {
      return { success: false, error: 'No active loan found' };
    }
    
    if (amount <= 0) {
      return { success: false, error: 'Repayment amount must be positive' };
    }
    
    if (user.cash < amount) {
      return { success: false, error: 'Insufficient cash' };
    }
    
    // Calculate how much interest to pay
    const now = new Date();
    const lastInterestAt = user.last_interest_at || activeLoan.taken_at;
    const hoursPassed = (now.getTime() - lastInterestAt.getTime()) / (1000 * 60 * 60);
    const interestAccrued = activeLoan.amount * FINANCIAL_CONFIG.LOAN_INTEREST_RATE * hoursPassed;
    
    const totalDue = activeLoan.amount + interestAccrued;
    const actualRepayment = Math.min(amount, totalDue);
    
    const newLoanAmount = totalDue - actualRepayment;
    
    if (newLoanAmount <= 0) {
      // Loan is fully repaid
      await userProfileQueries.update(user.id, {
        cash: user.cash - actualRepayment,
        loan_amount: 0,
        last_interest_at: now,
      });
      
      await loanQueries.markAsInactive(activeLoan.id);
    } else {
      // Partial repayment
      await userProfileQueries.update(user.id, {
        cash: user.cash - actualRepayment,
        loan_amount: newLoanAmount,
        last_interest_at: now,
      });
      
      await loanQueries.update(activeLoan.id, {
        amount: newLoanAmount,
        total_interest_paid: activeLoan.total_interest_paid + (actualRepayment - (activeLoan.amount - newLoanAmount)),
      });
    }
    
    // Log transaction
    await transactionQueries.create({
      user_id: userId,
      transaction_type: 'LOAN_REPAY',
      ticker: null,
      shares: null,
      price: null,
      amount: actualRepayment,
      fee: 0,
      balance_after: user.cash - actualRepayment,
      metadata: { loanId: activeLoan.id, interestPaid: interestAccrued },
    });
    
    // Create notification
    await notificationQueries.create({
      user_id: userId,
      notification_type: 'LOAN_DUE',
      title: 'Loan Repayment',
      message: `You have repaid $${actualRepayment.toFixed(2)} on your loan. Remaining: $${Math.max(newLoanAmount, 0).toFixed(2)}`,
      metadata: { repayment: actualRepayment, newLoanAmount },
    });
    
    return { success: true, newLoanAmount: Math.max(newLoanAmount, 0) };
  }

  async getLoanInfo(userId: string): Promise<{ loan?: LoanRow; amount: number; interestRate: number; dueAt?: Date; totalInterestPaid: number }> {
    const activeLoan = await loanQueries.getActiveByUserId(userId);
    
    if (!activeLoan) {
      return { amount: 0, interestRate: FINANCIAL_CONFIG.LOAN_INTEREST_RATE, totalInterestPaid: 0 };
    }
    
    return {
      loan: activeLoan,
      amount: activeLoan.amount,
      interestRate: activeLoan.interest_rate,
      dueAt: activeLoan.due_at,
      totalInterestPaid: activeLoan.total_interest_paid,
    };
  }

  async getMaxLoanAmount(userId: string): Promise<number> {
    const user = await userProfileQueries.getById(userId);
    if (!user) return 0;
    
    const portfolio = await portfolioQueries.getByUserId(userId);
    const stocks = await portfolioQueries.getAll();
    
    let portfolioValue = 0;
    for (const position of portfolio) {
      const stock = stocks.find(s => s.ticker === position.ticker);
      if (stock) {
        portfolioValue += position.shares * stock.current_price;
      }
    }
    
    const netWorth = user.cash + portfolioValue;
    return netWorth * FINANCIAL_CONFIG.LOAN_MAX_PERCENTAGE;
  }
}

// Singleton instance
export const loanEngine = new LoanEngine();
