import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { loanEngine } from '../engines/loan';
import { userProfileQueries, loanQueries } from '../db/client';
import { FINANCIAL_CONFIG } from '../config';

// ============================================
// LOAN COMMAND
// ============================================

export const loanCommand = {
  data: new SlashCommandBuilder()
    .setName('loan')
    .setDescription('Take out or repay a bank loan')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'take', value: 'take' },
          { name: 'repay', value: 'repay' },
          { name: 'info', value: 'info' }
        )
    )
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('Amount for loan action')
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const action = interaction.options.getString('action', true);
      const amount = interaction.options.getNumber('amount', false);
      const userId = interaction.user.id;

      // Check if user exists
      const user = await userProfileQueries.getByDiscordId(userId);
      if (!user) {
        await interaction.editReply({
          content: `❌ You need to join first! Use "/join" to create your profile.`,
        });
        return;
      }

      switch (action) {
        case 'take':
          await this.handleTakeLoan(interaction, user, amount);
          break;
        case 'repay':
          await this.handleRepayLoan(interaction, user, amount);
          break;
        case 'info':
          await this.handleLoanInfo(interaction, user);
          break;
      }
    } catch (error) {
      console.error('Loan command error:', error);
      await interaction.editReply({
        content: `❌ An error occurred while processing your loan request. Please try again.`,
      });
    }
  },

  private async handleTakeLoan(
    interaction: ChatInputCommandInteraction,
    user: any,
    amount?: number
  ): Promise<void> {
    if (!amount) {
      // Show max loan amount
      const maxLoan = await loanEngine.getMaxLoanAmount(user.id);
      await interaction.editReply({
        content: `💰 **Available Loan: Up to $${maxLoan.toFixed(2)}**\n\nYour net worth: $${user.net_worth.toFixed(2)}\nMaximum loan (50%): $${maxLoan.toFixed(2)}\nInterest rate: ${(FINANCIAL_CONFIG.LOAN_INTEREST_RATE * 100).toFixed(0)}% per hour\n\nUse: "/loan take [amount]"`,
      });
      return;
    }

    // Check if amount is whole number
    if (!Number.isInteger(amount)) {
      await interaction.editReply({
        content: `❌ Loan amount must be a whole number.`,
      });
      return;
    }

    const result = await loanEngine.takeLoan(user.id, amount);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.error}`,
      });
      return;
    }

    const newLoanAmount = result.newLoanAmount!;

    await interaction.editReply({
      content: `✅ **Loan Taken!**\n\n💰 **Amount:** $${amount.toFixed(2)}\n💳 **New Loan Balance:** $${newLoanAmount.toFixed(2)}\n⏰ **Interest:** ${(FINANCIAL_CONFIG.LOAN_INTEREST_RATE * 100).toFixed(0)}% per hour\n⚠️ **Liquidation:** After ${FINANCIAL_CONFIG.LOAN_LIQUIDATION_HOURS} hours if unpaid`,
    });
  }

  private async handleRepayLoan(
    interaction: ChatInputCommandInteraction,
    user: any,
    amount?: number
  ): Promise<void> {
    if (!amount) {
      // Show current loan info
      const loanInfo = await loanEngine.getLoanInfo(user.id);
      
      if (loanInfo.amount <= 0) {
        await interaction.editReply({
          content: `✅ You have no active loans.`,
        });
        return;
      }

      await interaction.editReply({
        content: `💳 **Current Loan: $${loanInfo.amount.toFixed(2)}**\n\nUse: "/loan repay [amount]" or "/loan repay all"`,
      });
      return;
    }

    // Check if amount is whole number
    if (!Number.isInteger(amount)) {
      await interaction.editReply({
        content: `❌ Repayment amount must be a whole number.`,
      });
      return;
    }

    const result = await loanEngine.repayLoan(user.id, amount);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.error}`,
      });
      return;
    }

    const newLoanAmount = result.newLoanAmount!;

    if (newLoanAmount <= 0) {
      await interaction.editReply({
        content: `✅ **Loan Fully Repaid!**\n\n💰 **Amount Repaid:** $${amount.toFixed(2)}\n💳 **Loan Balance:** $0.00`,
      });
    } else {
      await interaction.editReply({
        content: `✅ **Loan Repayment Successful!**\n\n💰 **Amount Repaid:** $${amount.toFixed(2)}\n💳 **Remaining Balance:** $${newLoanAmount.toFixed(2)}`,
      });
    }
  }

  private async handleLoanInfo(
    interaction: ChatInputCommandInteraction,
    user: any
  ): Promise<void> {
    const loanInfo = await loanEngine.getLoanInfo(user.id);
    const maxLoan = await loanEngine.getMaxLoanAmount(user.id);

    if (loanInfo.amount <= 0) {
      await interaction.editReply({
        content: `💳 **Loan Information**\n\n📊 **Status:** No active loan\n💰 **Available Credit:** $${maxLoan.toFixed(2)}\n⏰ **Interest Rate:** ${(FINANCIAL_CONFIG.LOAN_INTEREST_RATE * 100).toFixed(0)}% per hour`,
      });
      return;
    }

    const hoursSinceLoan = loanInfo.loan ? 
      (new Date().getTime() - loanInfo.loan.taken_at.getTime()) / (1000 * 60 * 60) : 0;
    const interestAccrued = loanInfo.amount * FINANCIAL_CONFIG.LOAN_INTEREST_RATE * 
      (hoursSinceLoan > 1 ? 1 : hoursSinceLoan);

    await interaction.editReply({
      content: `💳 **Loan Information**\n\n💰 **Current Balance:** $${loanInfo.amount.toFixed(2)}\n⏰ **Taken:** ${loanInfo.loan?.taken_at.toLocaleString()}\n📈 **Interest Rate:** ${(FINANCIAL_CONFIG.LOAN_INTEREST_RATE * 100).toFixed(0)}% per hour\n💸 **Interest Accrued:** ~$${interestAccrued.toFixed(2)}/hour\n⏳ **Time Until Liquidation:** ${Math.max(0, FINANCIAL_CONFIG.LOAN_LIQUIDATION_HOURS - Math.floor(hoursSinceLoan))} hours\n💳 **Available Credit:** $${maxLoan.toFixed(2)}`,
    });
  }
};
