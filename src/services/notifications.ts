import { Client, User, DMChannel } from 'discord.js';
import {
  notificationQueries,
  userProfileQueries,
  inventoryQueries,
  transactionQueries,
} from '../db/client';
import { NotificationRow } from '../db/types';
import { FINANCIAL_CONFIG, SHOP_ITEM_TYPES } from '../config';

// ============================================
// NOTIFICATION SERVICE
// ============================================

interface NotificationServiceOptions {
  client: Client;
  checkIntervalMs?: number;
  onError?: (error: Error) => void;
}

export class NotificationService {
  private client: Client;
  private checkInterval: NodeJS.Timeout | null = null;
  private options: NotificationServiceOptions;
  private isRunning: boolean = false;

  constructor(options: NotificationServiceOptions) {
    this.client = options.client;
    this.options = {
      checkIntervalMs: 30000, // 30 seconds
      onError: (error) => console.error('Notification Service Error:', error),
      ...options,
    };
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Notification Service started');
    
    // Initial check
    this.checkAndSendNotifications().catch(this.options.onError);
    
    // Schedule regular checks
    this.checkInterval = setInterval(
      () => this.checkAndSendNotifications().catch(this.options.onError),
      this.options.checkIntervalMs
    );
  }

  stop(): void {
    if (!this.isRunning) return;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('Notification Service stopped');
  }

  restart(): void {
    this.stop();
    this.start();
  }

  // ============================================
  // NOTIFICATION CHECKING
  // ============================================

  private async checkAndSendNotifications(): Promise<void> {
    try {
      // Get unsent notifications
      const unsentNotifications = await notificationQueries.getUnsent();
      
      for (const notification of unsentNotifications) {
        await this.sendNotification(notification);
      }
      
      // Check for whale transactions
      await this.checkWhaleTransactions();
      
      console.log(`Notification check completed. Processed ${unsentNotifications.length} notifications.`);
    } catch (error) {
      console.error('Notification check error:', error);
      throw error;
    }
  }

  // ============================================
  // NOTIFICATION SENDING
  // ============================================

  private async sendNotification(notification: NotificationRow): Promise<void> {
    try {
      const userProfile = await userProfileQueries.getById(notification.user_id);
      if (!userProfile) {
        await notificationQueries.markAsSent(notification.id);
        return;
      }

      // Get Discord user
      const discordUser = await this.client.users.fetch(userProfile.discord_id);
      if (!discordUser) {
        await notificationQueries.markAsSent(notification.id);
        return;
      }

      // Send DM
      try {
        await discordUser.send({
          content: notification.message,
        });
        
        // Mark as sent
        await notificationQueries.markAsSent(notification.id);
        console.log(`Notification sent to ${discordUser.username}: ${notification.title}`);
      } catch (dmError) {
        console.error(`Failed to send DM to ${discordUser.username}:`, dmError);
        // Mark as sent to avoid retrying
        await notificationQueries.markAsSent(notification.id);
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      // Mark as sent to avoid infinite retry
      await notificationQueries.markAsSent(notification.id);
    }
  }

  // ============================================
  // WHALE TRANSACTION TRACKING
  // ============================================

  private async checkWhaleTransactions(): Promise<void> {
    try {
      // Get recent large transactions
      const whaleTransactions = await transactionQueries.getRecentWhaleTransactions(
        FINANCIAL_CONFIG.WHALE_TRACKER_THRESHOLD
      );
      
      // Get users with Whale Tracker subscription
      const allUsers = await userProfileQueries.getAll();
      
      for (const user of allUsers) {
        const hasWhaleTracker = await inventoryQueries.hasActivePass(
          user.id,
          SHOP_ITEM_TYPES.WHALE_TRACKER_SUBSCRIPTION
        );
        
        if (hasWhaleTracker) {
          // Find transactions that happened since last notification
          const lastNotification = await notificationQueries.getByUserId(user.id, 1);
          const lastNotificationTime = lastNotification[0]?.created_at || new Date(0);
          
          const newWhaleTransactions = whaleTransactions.filter(
            tx => tx.created_at > lastNotificationTime && tx.user_id !== user.id
          );
          
          for (const tx of newWhaleTransactions) {
            const txUser = await userProfileQueries.getById(tx.user_id);
            if (!txUser) continue;
            
            let message = '';
            
            switch (tx.transaction_type) {
              case 'BUY':
                message = `🐋 **WHALE ALERT** 🐋\n\n${txUser.username} just bought ${tx.shares} shares of ${tx.ticker} for $${tx.amount.toFixed(2)}!`;
                break;
              case 'SELL':
                message = `🐋 **WHALE ALERT** 🐋\n\n${txUser.username} just sold ${tx.shares} shares of ${tx.ticker} for $${tx.amount.toFixed(2)}!`;
                break;
              case 'LOAN_TAKE':
                message = `🐋 **WHALE ALERT** 🐋\n\n${txUser.username} just took a loan of $${tx.amount.toFixed(2)}!`;
                break;
              case 'LOAN_REPAY':
                message = `🐋 **WHALE ALERT** 🐋\n\n${txUser.username} just repaid $${tx.amount.toFixed(2)} on their loan!`;
                break;
              default:
                message = `🐋 **WHALE ALERT** 🐋\n\n${txUser.username} made a transaction of $${tx.amount.toFixed(2)} (${tx.transaction_type})`;
            }
            
            // Create notification
            await notificationQueries.create({
              user_id: user.id,
              notification_type: 'WHALE_TRANSACTION',
              title: 'Whale Transaction Detected',
              message,
              metadata: {
                transactionId: tx.id,
                userId: tx.user_id,
                amount: tx.amount,
                type: tx.transaction_type,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error('Error checking whale transactions:', error);
    }
  }

  // ============================================
  // DIRECT NOTIFICATION METHODS
  // ============================================

  async createNotification(
    userId: string,
    type: NotificationRow['notification_type'],
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<NotificationRow> {
    return notificationQueries.create({
      user_id: userId,
      notification_type: type,
      title,
      message,
      metadata,
    });
  }

  async sendDirectNotification(
    userId: string,
    message: string
  ): Promise<boolean> {
    try {
      const userProfile = await userProfileQueries.getById(userId);
      if (!userProfile) return false;

      const discordUser = await this.client.users.fetch(userProfile.discord_id);
      if (!discordUser) return false;

      await discordUser.send({ content: message });
      return true;
    } catch (error) {
      console.error('Error sending direct notification:', error);
      return false;
    }
  }

  async broadcastNotification(
    message: string,
    excludeUserIds?: string[]
  ): Promise<number> {
    try {
      const users = await userProfileQueries.getAll();
      let sentCount = 0;

      for (const user of users) {
        if (excludeUserIds?.includes(user.id)) continue;

        try {
          const discordUser = await this.client.users.fetch(user.discord_id);
          await discordUser.send({ content: message });
          sentCount++;
        } catch (error) {
          console.error(`Failed to send broadcast to ${user.username}:`, error);
        }
      }

      return sentCount;
    } catch (error) {
      console.error('Error broadcasting notification:', error);
      return 0;
    }
  }
}

// Factory function to create notification service after client is ready
export const createNotificationService = (client: Client): NotificationService => {
  return new NotificationService({ client });
};
