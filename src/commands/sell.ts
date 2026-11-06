import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { portfolioService } from '../services/portfolio';
import { stockQueries, userProfileQueries } from '../db/client';

// ============================================
// SELL COMMAND
// ============================================

export const sellCommand = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell shares of a stock')
    .addStringOption(option =>
      option.setName('ticker')
        .setDescription('Stock ticker symbol')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option.setName('shares')
        .setDescription('Number of shares to sell')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const ticker = interaction.options.getString('ticker', true).toUpperCase();
      const shares = interaction.options.getNumber('shares', true);
      const userId = interaction.user.id;

      // Check if user exists
      const user = await userProfileQueries.getByDiscordId(userId);
      if (!user) {
        await interaction.editReply({
          content: `❌ You need to join first! Use "/join" to create your profile.`,
        });
        return;
      }

      // Check if stock exists
      const stock = await stockQueries.getByTicker(ticker);
      if (!stock) {
        await interaction.editReply({
          content: `❌ Stock "${ticker}" not found. Use "/stocks" to see available stocks.`,
        });
        return;
      }

      if (!stock.is_active) {
        await interaction.editReply({
          content: `❌ Stock "${ticker}" is not currently active.`,
        });
        return;
      }

      // Check if shares is a whole number
      if (!Number.isInteger(shares)) {
        await interaction.editReply({
          content: `❌ Shares must be a whole number.`,
        });
        return;
      }

      // Execute sell
      const result = await portfolioService.sellStock(user.id, ticker, shares);

      if (!result.success) {
        await interaction.editReply({
          content: `❌ ${result.error}`,
        });
        return;
      }

      const totalValue = result.totalValue!;
      const newCash = result.newCash!;
      const remainingShares = result.remainingShares!;

      let message = `✅ **Sale Successful!**\n\n📉 **${ticker}**: ${result.sharesSold} shares at $${stock.current_price.toFixed(2)}\n💰 **Total Value:** $${totalValue.toFixed(2)}\n💵 **New Cash:** $${newCash.toFixed(2)}`;

      if (remainingShares > 0) {
        message += `\n📊 **Remaining Shares:** ${remainingShares}`;
      } else {
        message += `\n📊 **Position Closed**`;
      }

      await interaction.editReply({
        content: message,
      });

      console.log(`User ${user.username} sold ${result.sharesSold} shares of ${ticker} for $${totalValue.toFixed(2)}`);
    } catch (error) {
      console.error('Sell command error:', error);
      await interaction.editReply({
        content: `❌ An error occurred while processing your sale. Please try again.`,
      });
    }
  },
};
