const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const OPTIONS = {
  opt1: {
    roleId: process.env.ROLE_ID_OPTION_1,
    label: process.env.ROLE_LABEL_OPTION_1,
  },
  opt2: {
    roleId: process.env.ROLE_ID_OPTION_2,
    label: process.env.ROLE_LABEL_OPTION_2,
  },
};

const commands = [
  new SlashCommandBuilder()
    .setName('인증')
    .setDescription('인증을 요청합니다 (이미지 첨부 필요)')
    .addAttachmentOption((option) =>
      option
        .setName('image')
        .setDescription('인증용 이미지')
        .setRequired(true)
    )
    .toJSON(),
];

async function handle(interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === '인증') {
    return handleVerifyCommand(interaction);
  }

  if (interaction.isButton()) {
    const [action] = interaction.customId.split('_');
    if (action !== 'opt1' && action !== 'opt2' && action !== 'deny') return;
    return handleButton(interaction);
  }
}

async function handleVerifyCommand(interaction) {
  try {
    await runVerifyCommand(interaction);
  } catch (err) {
    console.error('인증 처리 실패:', err);
    const message = '인증 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message }).catch(() => {});
    } else {
      await interaction
        .reply({ content: message, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

async function runVerifyCommand(interaction) {
  if (interaction.channelId !== process.env.VERIFY_CHANNEL_ID) {
    await interaction.reply({
      content: `이 명령어는 <#${process.env.VERIFY_CHANNEL_ID}> 채널에서만 사용할 수 있습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const attachment = interaction.options.getAttachment('image');

  if (!attachment.contentType?.startsWith('image/')) {
    await interaction.reply({
      content: '이미지 파일만 첨부할 수 있습니다.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (attachment.size > MAX_FILE_SIZE) {
    const sizeMB = (attachment.size / 1024 / 1024).toFixed(1);
    await interaction.reply({
      content: `이미지 크기가 너무 큽니다. 10MB 이하로 첨부해주세요. (현재: ${sizeMB}MB)`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const publicMessage = await interaction.editReply({
    content: `${interaction.user} 님이 인증을 요청했습니다. 관리자 승인을 기다려주세요.`,
    files: [attachment.url],
  });

  const adminChannel = await interaction.client.channels.fetch(process.env.ADMIN_CHANNEL_ID);

  const suffix = `${interaction.user.id}_${publicMessage.id}_${publicMessage.channelId}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`opt1_${suffix}`)
      .setLabel(OPTIONS.opt1.label)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`opt2_${suffix}`)
      .setLabel(OPTIONS.opt2.label)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`deny_${suffix}`)
      .setLabel('거부')
      .setStyle(ButtonStyle.Danger)
  );

  await adminChannel.send({
    content: `${interaction.user} (${interaction.user.tag}) 님이 인증을 요청했습니다.`,
    files: [attachment.url],
    components: [row],
  });
}

async function handleButton(interaction) {
  const [action, userId, messageId, channelId] = interaction.customId.split('_');
  const member = await interaction.guild.members.fetch(userId);

  const updatePublicMessage = async (newContent, emoji) => {
    try {
      const channel = await interaction.client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);
      await message.edit({ content: newContent });
      await message.react(emoji);
    } catch (err) {
      console.error('공개 메시지 갱신 실패:', err.message);
    }
  };

  if (action === 'deny') {
    await interaction.update({ content: `${member} 거부됨.`, components: [] });
    await updatePublicMessage(`${member} 님의 인증이 거부되었습니다.`, '❌');
    await member.send('인증이 거부되었습니다.').catch(() => {});
    return;
  }

  const { roleId, label } = OPTIONS[action];

  try {
    await member.roles.add(roleId);
    await interaction.update({ content: `${member} [${label}] 승인 완료.`, components: [] });
    await updatePublicMessage(`${member} 님의 [${label}]가 승인되었습니다.`, '✅');
    await member.send(`[${label}] 인증이 승인되었습니다!`).catch(() => {});
  } catch (err) {
    console.error('역할 부여 실패:', err.message);
    await interaction.reply({ content: '역할 부여에 실패했습니다. 봇 권한 또는 역할 순서를 확인해주세요.', flags: MessageFlags.Ephemeral });
  }
}

module.exports = { commands, handle };
