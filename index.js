require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const verify = require('./verify');
const progress = require('./progress');
const mission = require('./mission');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const commands = [...verify.commands, ...progress.commands, ...mission.commands];

client.once('clientReady', async () => {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
    { body: commands }
  );
  console.log(`Logged in as ${client.user.tag}`);
  progress.init(client);
});

client.on('interactionCreate', async (interaction) => {
  await verify.handle(interaction);
  await progress.handle(interaction);
  await mission.handle(interaction);
});

client.login(process.env.DISCORD_TOKEN);
