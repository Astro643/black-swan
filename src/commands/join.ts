import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { userProfileQueries } from '../db/client';
import { FINANCIAL_CONFIG } from '../config';
import { UserProfileRow } from '../db/types';

// ============================================
// JOIN COMMAND
// ============================================

export const joinCommand = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Create your starting profile and receive starter cash'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const discordId = interaction.user.id;
      const username = interaction.user.username;
      const discriminator = interaction.user.discriminator || '0';
      const avatar = interaction.user.avatarURL() || null;

      // Check if user already exists
      const existingUser = await userProfileQueries.getByDiscordId(discordId);
      
      if (existingUser) {
        await interaction.editReply({
          content: `❌ You already have a profile! You have $${existingUser.cash.toFixed(2)} in cash.`,
        });
        return;
      }

      // Create new profile
      const newUser = await userProfileQueries.create({
        discord_id: discordId,
        username,
        discriminator,
        avatar,
        cash: FINANCIAL_CONFIG.STARTER_CASH,
        net_worth: FINANCIAL_CONFIG.STARTER_CASH,
        loan_amount: 0,
        loan_taken_at: null,
        last_interest_at: null,
        loan_payments_missed: 0,
        total_earnings: 0,
        total_spent: 0,
        cosmetic_ids: [],
        has_analyst_pass: false,
        is_liquidated: false,
        last_tax_at: null,
      });

      await interaction.editReply({
        content: `✅ Welcome to Black Swan! Your profile has been created.\n\n💰 **Starter Cash:** $${FINANCIAL_CONFIG.STARTER_CASH.toFixed(2)}\n📊 **Net Worth:** $${FINANCIAL_CONFIG.STARTER_CASH.toFixed(2)}\n\nUse "/stocks" to see available stocks and "/buy [ticker] [shares]" to start trading!`,
      });

      console.log(`New user joined: ${username} (${discordId})`);
    } catch (error) {
      console.error('Join command error:', error);
      await interaction.editReply({
        content: `❌ An error occurred while creating your profile. Please try again later.`,
      });
    }
  },
};
