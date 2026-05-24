require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const verify = require('./verify');
const progress = require('./progress');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [...verify.commands, ...progress.commands];

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
});

client.login(process.env.DISCORD_TOKEN);
