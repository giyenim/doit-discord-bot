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

async function reportFatal(label, headline, err) {
  console.error(`[${label}]`, err);
  try {
    const channel = await client.channels.fetch(process.env.ADMIN_CHANNEL_ID);
    const reason = (err?.stack || err?.message || String(err)).slice(0, 1800);
    await channel.send(`🚨 [${label}] ${headline}\n\`\`\`${reason}\`\`\``);
  } catch {}
}

process.on('uncaughtException', async (err) => {
  await reportFatal('uncaughtException', '봇이 치명적 오류로 종료됩니다.', err);
  process.exit(1);
});

process.on('unhandledRejection', async (err) => {
  await reportFatal('unhandledRejection', '처리되지 않은 비동기 오류가 발생했어요.', err);
});

client.login(process.env.DISCORD_TOKEN);