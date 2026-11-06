import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { portfolioService } from '../services/portfolio';
import { stockQueries, userProfileQueries } from '../db/client';

// ============================================
// BUY COMMAND
// ============================================

export const buyCommand = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy shares of a stock')
    .addStringOption(option =>
      option.setName('ticker')
        .setDescription('Stock ticker symbol')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option.setName('shares')
        .setDescription('Number of shares to buy')
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

      // Execute buy
      const result = await portfolioService.buyStock(user.id, ticker, shares);

      if (!result.success) {
        await interaction.editReply({
          content: `❌ ${result.error}`,
        });
        return;
      }

      const totalCost = result.totalCost!;
      const newCash = result.newCash!;

      await interaction.editReply({
        content: `✅ **Purchase Successful!**\n\n📈 **${ticker}**: ${shares} shares at $${stock.current_price.toFixed(2)}\n💰 **Total Cost:** $${totalCost.toFixed(2)}\n💵 **Remaining Cash:** $${newCash.toFixed(2)}`,
      });

      console.log(`User ${user.username} bought ${shares} shares of ${ticker} for $${totalCost.toFixed(2)}`);
    } catch (error) {
      console.error('Buy command error:', error);
      await interaction.editReply({
        content: `❌ An error occurred while processing your purchase. Please try again.`,
      });
    }
  },
};
