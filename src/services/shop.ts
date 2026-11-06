import {
  userProfileQueries,
  inventoryQueries,
  shopItemQueries,
  notificationQueries,
  transactionQueries,
  portfolioQueries,
  stockQueries,
} from '../db/client';
import {
  InventoryRow,
  ShopItemRow,
  UserProfileRow,
  PortfolioRow,
  StockRow,
} from '../db/types';
import { SHOP_ITEM_TYPES, FINANCIAL_CONFIG, MARKET_CONFIG } from '../config';
import { marketEngine } from '../engines/market';

// ============================================
// SHOP SERVICE
// ============================================

export interface ShopItemPurchaseResult {
  success: boolean;
  error?: string;
  item?: InventoryRow;
  newCash?: number;
}

export interface ShopItemUseResult {
  success: boolean;
  error?: string;
  message?: string;
}

export class ShopService {
  // ============================================
  // ITEM PURCHASE
  // ============================================

  async purchaseItem(
    userId: string,
    itemId: string
  ): Promise<ShopItemPurchaseResult> {
    const user = await userProfileQueries.getById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const shopItem = await shopItemQueries.getByItemId(itemId as SHOP_ITEM_TYPES);
    if (!shopItem) {
      return { success: false, error: 'Item not found in shop' };
    }

    if (!shopItem.is_active) {
      return { success: false, error: 'Item is not available for purchase' };
    }

    if (user.cash < shopItem.price) {
      return { success: false, error: `Insufficient cash. Need $${shopItem.price.toFixed(2)}` };
    }

    // Deduct cash
    const newCash = user.cash - shopItem.price;
    await userProfileQueries.update(user.id, {
      cash: newCash,
      total_spent: user.total_spent + shopItem.price,
    });

    // Create inventory item
    const inventoryItem = await inventoryQueries.create({
      user_id: user.id,
      shop_item_id: shopItem.id,
      item_id: shopItem.item_id as SHOP_ITEM_TYPES,
      quantity: 1,
      purchased_at: new Date(),
      last_used_at: null,
      uses_remaining: shopItem.max_uses,
      is_active: shopItem.is_active_pass,
      expires_at: null,
      metadata: null,
    });

    // Log transaction
    await transactionQueries.create({
      user_id: user.id,
      transaction_type: 'BUY',
      ticker: null,
      shares: null,
      price: null,
      amount: shopItem.price,
      fee: 0,
      balance_after: newCash,
      metadata: { itemId: shopItem.item_id, itemName: shopItem.name },
    });

    // Handle special item effects on purchase
    await this.handleItemPurchaseEffects(user, shopItem, inventoryItem);

    return { success: true, item: inventoryItem, newCash };
  }

  // ============================================
  // ITEM USAGE
  // ============================================

  async useItem(
    userId: string,
    itemId: string,
    targetTicker?: string,
    targetUserId?: string
  ): Promise<ShopItemUseResult> {
    const user = await userProfileQueries.getById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const inventoryItem = await inventoryQueries.getByUserIdAndItemId(userId, itemId as SHOP_ITEM_TYPES);
    if (!inventoryItem) {
      return { success: false, error: 'Item not found in inventory' };
    }

    if (inventoryItem.quantity < 1) {
      return { success: false, error: 'No quantity left' };
    }

    const shopItem = await shopItemQueries.getByItemId(itemId as SHOP_ITEM_TYPES);
    if (!shopItem) {
      return { success: false, error: 'Item not found in shop' };
    }

    // Check if item is consumable
    if (shopItem.is_consumable) {
      if (inventoryItem.uses_remaining !== null && inventoryItem.uses_remaining <= 0) {
        return { success: false, error: 'No uses remaining' };
      }
    }

    // Handle specific item effects
    const result = await this.handleItemUsage(
      user,
      inventoryItem,
      shopItem,
      targetTicker,
      targetUserId
    );

    if (!result.success) {
      return result;
    }

    // Consume item if it's consumable
    if (shopItem.is_consumable) {
      await inventoryQueries.consume(inventoryItem.id);
    }

    // Update last used time
    await inventoryQueries.update(inventoryItem.id, {
      last_used_at: new Date(),
    });

    return result;
  }

  // ============================================
  // ITEM EFFECTS ON PURCHASE
  // ============================================

  private async handleItemPurchaseEffects(
    user: UserProfileRow,
    shopItem: ShopItemRow,
    inventoryItem: InventoryRow
  ): Promise<void> {
    switch (shopItem.item_id) {
      case SHOP_ITEM_TYPES.ANALYST_TERMINAL_PASS:
        await userProfileQueries.update(user.id, {
          has_analyst_pass: true,
        });
        break;

      case SHOP_ITEM_TYPES.TAX_HAVEN_REGISTRATION:
      case SHOP_ITEM_TYPES.WHALE_TRACKER_SUBSCRIPTION:
      case SHOP_ITEM_TYPES.BAILOUT_BOND:
        // These are active passes - mark as active
        await inventoryQueries.update(inventoryItem.id, {
          is_active: true,
        });
        break;
    }
  }

  // ============================================
  // ITEM EFFECTS ON USAGE
  // ============================================

  private async handleItemUsage(
    user: UserProfileRow,
    inventoryItem: InventoryRow,
    shopItem: ShopItemRow,
    targetTicker?: string,
    targetUserId?: string
  ): Promise<ShopItemUseResult> {
    switch (shopItem.item_id) {
      // Protection Items
      case SHOP_ITEM_TYPES.STOP_LOSS_CONTRACT:
        return await this.useStopLossContract(user, targetTicker);

      // Intelligence Items
      case SHOP_ITEM_TYPES.CORPORATE_ESPIONAGE_KEY:
        return await this.useCorporateEspionageKey(user, targetTicker);

      // Chaos Cards
      case SHOP_ITEM_TYPES.PUMP_CARD:
        return await this.usePumpCard(user, targetTicker);

      case SHOP_ITEM_TYPES.DUMP_CARD:
        return await this.useDumpCard(user, targetTicker);

      default:
        return { success: true, message: 'Item used successfully' };
    }
  }

  // ============================================
  // SPECIFIC ITEM HANDLERS
  // ============================================

  // Stop-Loss Contract: Attach to a stock ticker
  private async useStopLossContract(
    user: UserProfileRow,
    targetTicker?: string
  ): Promise<ShopItemUseResult> {
    if (!targetTicker) {
      return { success: false, error: 'Please specify a ticker to attach the stop-loss to' };
    }

    const stock = await stockQueries.getByTicker(targetTicker);
    if (!stock) {
      return { success: false, error: 'Stock not found' };
    }

    const portfolioItem = await portfolioQueries.getByUserIdAndTicker(user.id, targetTicker);
    if (!portfolioItem) {
      return { success: false, error: `You don't own any shares of ${targetTicker}` };
    }

    // Calculate stop-loss price (20% below current price)
    const stopLossPrice = stock.current_price * (1 - FINANCIAL_CONFIG.STOP_LOSS_THRESHOLD);

    // Update portfolio with stop-loss
    await portfolioQueries.update(portfolioItem.id, {
      stop_loss_price: stopLossPrice,
      stop_loss_contract_id: inventoryItem.id,
    });

    return {
      success: true,
      message: `Stop-loss contract attached to ${targetTicker} at $${stopLossPrice.toFixed(2)}`,
    };
  }

  // Corporate Espionage Key: Reveal a stock's base volatility
  private async useCorporateEspionageKey(
    user: UserProfileRow,
    targetTicker?: string
  ): Promise<ShopItemUseResult> {
    if (!targetTicker) {
      return { success: false, error: 'Please specify a ticker to spy on' };
    }

    const stock = await stockQueries.getByTicker(targetTicker);
    if (!stock) {
      return { success: false, error: 'Stock not found' };
    }

    const baseVolatility = stock.base_volatility;

    // Send DM to user with the information
    await notificationQueries.create({
      user_id: user.id,
      notification_type: 'WHALE_TRANSACTION', // Reusing for now
      title: 'Corporate Espionage Result',
      message: `Stock ${targetTicker} has a base volatility of ${(baseVolatility * 100).toFixed(2)}%`,
      metadata: { ticker: targetTicker, baseVolatility },
    });

    return {
      success: true,
      message: `Revealed base volatility for ${targetTicker}: ${(baseVolatility * 100).toFixed(2)}%`,
    };
  }

  // Pump Card: Schedule a pump for the next tick
  private async usePumpCard(
    user: UserProfileRow,
    targetTicker?: string
  ): Promise<ShopItemUseResult> {
    if (!targetTicker) {
      return { success: false, error: 'Please specify a ticker to pump' };
    }

    const stock = await stockQueries.getByTicker(targetTicker);
    if (!stock) {
      return { success: false, error: 'Stock not found' };
    }

    // Schedule manipulation for next tick
    await marketEngine.scheduleManipulation(
      user.id,
      user.discord_id,
      targetTicker,
      'PUMP'
    );

    return {
      success: true,
      message: `Pump card used on ${targetTicker}. Will take effect on next market tick.`,
    };
  }

  // Dump Card: Schedule a dump for the next tick
  private async useDumpCard(
    user: UserProfileRow,
    targetTicker?: string
  ): Promise<ShopItemUseResult> {
    if (!targetTicker) {
      return { success: false, error: 'Please specify a ticker to dump' };
    }

    const stock = await stockQueries.getByTicker(targetTicker);
    if (!stock) {
      return { success: false, error: 'Stock not found' };
    }

    // Schedule manipulation for next tick
    await marketEngine.scheduleManipulation(
      user.id,
      user.discord_id,
      targetTicker,
      'DUMP'
    );

    return {
      success: true,
      message: `Dump card used on ${targetTicker}. Will take effect on next market tick.`,
    };
  }

  // ============================================
  // INVENTORY MANAGEMENT
  // ============================================

  async getUserInventory(userId: string): Promise<InventoryRow[]> {
    return inventoryQueries.getByUserId(userId);
  }

  async getUserInventoryWithDetails(userId: string): Promise<{
    item: InventoryRow;
    shopItem: ShopItemRow;
  }[]> {
    const inventory = await inventoryQueries.getByUserId(userId);
    const itemsWithDetails = [];

    for (const invItem of inventory) {
      const shopItem = await shopItemQueries.getByItemId(invItem.item_id);
      if (shopItem) {
        itemsWithDetails.push({ item: invItem, shopItem });
      }
    }

    return itemsWithDetails;
  }

  async hasItem(userId: string, itemId: string): Promise<boolean> {
    return inventoryQueries.hasItem(userId, itemId as SHOP_ITEM_TYPES);
  }

  async hasActivePass(userId: string, itemId: string): Promise<boolean> {
    return inventoryQueries.hasActivePass(userId, itemId as SHOP_ITEM_TYPES);
  }

  async getActivePasses(userId: string): Promise<InventoryRow[]> {
    return inventoryQueries.getActivePasses(userId);
  }

  // ============================================
  // SHOP CATALOG
  // ============================================

  async getShopCatalog(): Promise<ShopItemRow[]> {
    return shopItemQueries.getAllActive();
  }

  async getShopCatalogByCategory(category: string): Promise<ShopItemRow[]> {
    return shopItemQueries.getByCategory(category);
  }

  async getShopItem(itemId: string): Promise<ShopItemRow | null> {
    return shopItemQueries.getByItemId(itemId as SHOP_ITEM_TYPES);
  }

  // ============================================
  // COSMETICS
  // ============================================

  async addCosmetic(userId: string, cosmeticId: string): Promise<boolean> {
    const user = await userProfileQueries.getById(userId);
    if (!user) return false;

    const currentCosmetics = user.cosmetic_ids || [];
    
    if (currentCosmetics.includes(cosmeticId)) {
      return true; // Already has it
    }

    await userProfileQueries.update(user.id, {
      cosmetic_ids: [...currentCosmetics, cosmeticId],
    });

    return true;
  }

  async removeCosmetic(userId: string, cosmeticId: string): Promise<boolean> {
    const user = await userProfileQueries.getById(userId);
    if (!user) return false;

    const currentCosmetics = user.cosmetic_ids || [];
    const newCosmetics = currentCosmetics.filter(id => id !== cosmeticId);

    await userProfileQueries.update(user.id, {
      cosmetic_ids: newCosmetics,
    });

    return true;
  }

  async getUserCosmetics(userId: string): Promise<string[]> {
    const user = await userProfileQueries.getById(userId);
    return user?.cosmetic_ids || [];
  }
}

// Singleton instance
export const shopService = new ShopService();
