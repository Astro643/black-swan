import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { stockQueries } from '../db/client';
import { DASHBOARD_URL } from '../config';
import { StockRow } from '../db/types';

// ============================================
// STOCKS COMMAND
// ============================================

export const stocksCommand = {
  data: new SlashCommandBuilder()
    .setName('stocks')
    .setDescription('View active stock tickers and prices with dashboard link'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: false });

    try {
      const stocks = await stockQueries.getAllActive();
      
      if (stocks.length === 0) {
        await interaction.editReply({
          content: `❌ No active stocks found.\n\n[View Dashboard](${DASHBOARD_URL})`,
        });
        return;
      }

      // Group by category
      const techStocks = stocks.filter(s => s.category === 'TECH');
      const memeStocks = stocks.filter(s => s.category === 'MEME');
      const safeHavenStocks = stocks.filter(s => s.category === 'SAFE_HAVEN');

      // Format stock info
      const formatStock = (s: StockRow) => {
        const change = s.current_price >= s.last_price_update ? 
          `📈 +$${(s.current_price - s.last_price_update).toFixed(2)}` :
          `📉 -$${(s.last_price_update - s.current_price).toFixed(2)}`;
        return `${s.ticker}: $${s.current_price.toFixed(2)} ${change}`;
      };

      // Build message
      let message = `📊 **Black Swan Stock Market**\n\n`;
      
      if (techStocks.length > 0) {
        message += `💻 **TECH**\n${techStocks.map(formatStock).join(' | ')}\n\n`;
      }
      
      if (memeStocks.length > 0) {
        message += `🚀 **MEME**\n${memeStocks.map(formatStock).join(' | ')}\n\n`;
      }
      
      if (safeHavenStocks.length > 0) {
        message += `🛡️ **SAFE HAVEN**\n${safeHavenStocks.map(formatStock).join(' | ')}\n\n`;
      }

      message += `[🌐 View Live Dashboard →](${DASHBOARD_URL})`;

      // Split message if too long
      if (message.length > 2000) {
        message = message.substring(0, 1900) + `...\n\n[View Full Dashboard](${DASHBOARD_URL})`;
      }

      await interaction.editReply({
        content: message,
      });
    } catch (error) {
      console.error('Stocks command error:', error);
      await interaction.editReply({
        content: `❌ An error occurred while fetching stock data.\n\n[View Dashboard](${DASHBOARD_URL})`,
      });
    }
  },
};
