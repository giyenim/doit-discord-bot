require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('인증을 요청합니다')
    .toJSON(),
];

client.once('clientReady', async () => {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
    { body: commands }
  );
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
    const adminChannel = await client.channels.fetch(process.env.ADMIN_CHANNEL_ID);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${interaction.user.id}`)
        .setLabel('승인')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${interaction.user.id}`)
        .setLabel('거부')
        .setStyle(ButtonStyle.Danger)
    );

    await adminChannel.send({
      content: `${interaction.user} (${interaction.user.tag}) 님이 인증을 요청했습니다.`,
      components: [row],
    });

    await interaction.reply({
      content: '인증 요청이 전송되었습니다. 관리자 승인을 기다려주세요.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.isButton()) {
    const [action, userId] = interaction.customId.split('_');
    if (action !== 'approve' && action !== 'deny') return;

    const member = await interaction.guild.members.fetch(userId);

    if (action === 'approve') {
      try {
        await member.roles.add(process.env.ROLE_ID);
        await interaction.update({ content: `${member} 승인 완료.`, components: [] });
        await member.send('인증이 승인되었습니다!').catch(() => {});
      } catch (err) {
        console.error('역할 부여 실패:', err.message);
        await interaction.reply({ content: '역할 부여에 실패했습니다. 봇 권한 또는 역할 순서를 확인해주세요.', flags: MessageFlags.Ephemeral });
      }
    } else {
      await interaction.update({ content: `${member} 거부됨.`, components: [] });
      await member.send('인증이 거부되었습니다.').catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
