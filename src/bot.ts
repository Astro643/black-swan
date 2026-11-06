import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import dotenv from 'dotenv';
import {
  joinCommand,
  stocksCommand,
  buyCommand,
  sellCommand,
  loanCommand,
} from './commands';
import { marketEngine } from './engines/market';
import { loanEngine } from './engines/loan';
import { taxEngine } from './engines/tax';
import { createNotificationService } from './services/notifications';
import { pool, testConnection } from './db/client';
import { DISCORD_TOKEN, DISCORD_CONFIG } from './config';

// ============================================
// DISCORD BOT SETUP
// ============================================

// Load environment variables
dotenv.config();

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Command collection
const commands = new Collection();

// Register commands
commands.set(joinCommand.data.name, joinCommand);
commands.set(stocksCommand.data.name, stocksCommand);
commands.set(buyCommand.data.name, buyCommand);
commands.set(sellCommand.data.name, sellCommand);
commands.set(loanCommand.data.name, loanCommand);

// ============================================
// EVENT HANDLERS
// ============================================

// Ready event
client.on('ready', async () => {
  console.log(`✅ Bot logged in as ${client.user?.tag} (${client.user?.id})`);
  console.log(`📊 Connected to ${client.guilds.cache.size} guild(s)`);
  
  // Test database connection
  const dbConnected = await testConnection();
  if (dbConnected) {
    console.log('✅ Database connection established');
  } else {
    console.error('❌ Failed to connect to database');
  }
  
  // Start engines
  marketEngine.start();
  loanEngine.start();
  taxEngine.start();
  
  // Start notification service
  const notificationService = createNotificationService(client);
  notificationService.start();
  
  // Set bot presence
  client.user?.setPresence({
    activities: [{ name: 'Black Swan | /join to start', type: 0 }],
    status: 'online',
  });
  
  console.log('🚀 All systems operational');
});

// Interaction event
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const command = commands.get(interaction.commandName);
  if (!command) {
    console.error(`❌ No command matching ${interaction.commandName} was found.`);
    return;
  }
  
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing ${interaction.commandName}:`, error);
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ An error occurred while executing this command.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ An error occurred while executing this command.',
        ephemeral: true,
      });
    }
  }
});

// Error event
client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

// Process exit handling
process.on('SIGINT', async () => {
  console.log('\n🔴 Received SIGINT. Shutting down gracefully...');
  
  // Stop engines
  marketEngine.stop();
  loanEngine.stop();
  taxEngine.stop();
  
  // Close database pool
  try {
    await pool.end();
    console.log('✅ Database pool closed');
  } catch (error) {
    console.error('❌ Error closing database pool:', error);
  }
  
  // Destroy client
  client.destroy();
  console.log('✅ Discord client destroyed');
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔴 Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// ============================================
// BOT INITIALIZATION
// ============================================

// Deploy commands
const deployCommands = async () => {
  try {
    console.log('📤 Deploying slash commands...');
    
    const commandsArray = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
    
    // Register commands globally (takes up to 1 hour to propagate)
    // For development, use guild-specific commands
    const devGuildId = process.env.DEV_GUILD_ID;
    
    if (devGuildId) {
      const devGuild = await client.guilds.fetch(devGuildId);
      await devGuild.commands.set(commandsArray);
      console.log(`✅ Deployed ${commands.size} commands to development guild`);
    } else {
      await client.application?.commands.set(commandsArray);
      console.log(`✅ Deployed ${commands.size} commands globally`);
    }
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
};

// Login and deploy
const main = async () => {
  try {
    // Login to Discord
    await client.login(DISCORD_TOKEN);
    
    // Wait for client to be ready
    await new Promise((resolve) => {
      if (client.isReady()) {
        resolve(void 0);
      } else {
        client.once('ready', resolve);
      }
    });
    
    // Deploy commands after ready
    await deployCommands();
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
};

// Start the bot
main().catch(console.error);

// ============================================
// EXPORT FOR TESTING
// ============================================

export {
  client,
  commands,
  marketEngine,
  loanEngine,
  taxEngine,
  createNotificationService,
};
