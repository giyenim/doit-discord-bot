const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const MESSAGES = {
  internalError: '인증 요청 처리 중 오류가 발생했어요😵 잠시 후 다시 시도해주세요.',
  wrongChannel: (channelId) => `이 명령어는 <#${channelId}> 채널에서만 사용할 수 있어요.`,
  notImage: '이미지 파일만 첨부할 수 있어요!',
  fileTooLarge: (sizeMB) => `이미지 크기가 너무 커요😵‍💫 10MB 이하로 첨부해주세요. (현재: ${sizeMB}MB)`,
  publicPending: (user) => `${user} 님의 인증 요청이 접수되었어요!\n관리자 확인 후 승인해 드릴게요. 평일 기준 1일 이내에 처리되니 조금만 기다려 주세요:)`,
  adminRequest: (user) => `${user} (${user.tag}) 님이 인증을 요청했습니다.`,
  adminApproved: (member, label) => `${member} [${label}] 승인 완료.`,
  publicApproved: (member, label) => `${member} 님의 [${label}] 인증이 승인되었어요! Do it! 스터디 멤버가 되신 걸 진심으로 환영합니다🎉`,
  dmApproved: (label) => `🎉 [${label}] 인증이 완료되었어요!\nDo it! 스터디 멤버가 되신 걸 진심으로 환영합니다:)\n자세한 스터디 일정과 내용은 [${label}] 채널 공지를 확인해 주세요.\n함께 끝까지 가실 거죠? 잘 부탁드립니다!!`,
  adminDenied: (member) => `${member} 거부됨.`,
  publicDenied: (member) => `${member} 님의 인증이 거부되었어요😢\n인증 이미지를 다시 한번 확인해 주시겠어요? 재신청 언제든 가능해요!`,
  dmDenied: '아쉽게도 이번 인증은 승인이 어려웠어요😢\n인증 이미지를 다시 한번 확인해서 재신청해 주시겠어요?\n문의가 있으시다면 언제든 신청 채널에서 편하게 말씀해 주세요.',
  roleError: '역할 부여에 실패했습니다. 봇 권한 또는 역할 순서를 확인해주세요.',
};

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
    const message = MESSAGES.internalError;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message }).catch(() => { });
    } else {
      await interaction
        .reply({ content: message, flags: MessageFlags.Ephemeral })
        .catch(() => { });
    }
  }
}

async function runVerifyCommand(interaction) {
  if (interaction.channelId !== process.env.VERIFY_CHANNEL_ID) {
    await interaction.reply({
      content: MESSAGES.wrongChannel(process.env.VERIFY_CHANNEL_ID),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const attachment = interaction.options.getAttachment('image');

  if (!attachment.contentType?.startsWith('image/')) {
    await interaction.reply({
      content: MESSAGES.notImage,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (attachment.size > MAX_FILE_SIZE) {
    const sizeMB = (attachment.size / 1024 / 1024).toFixed(1);
    await interaction.reply({
      content: MESSAGES.fileTooLarge(sizeMB),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const publicMessage = await interaction.editReply({
    content: MESSAGES.publicPending(interaction.user),
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
    content: MESSAGES.adminRequest(interaction.user),
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
    await interaction.update({ content: MESSAGES.adminDenied(member), components: [] });
    await updatePublicMessage(MESSAGES.publicDenied(member), '❌');
    await member.send(MESSAGES.dmDenied).catch(() => { });
    return;
  }

  const { roleId, label } = OPTIONS[action];

  try {
    await member.roles.add(roleId);
    await interaction.update({ content: MESSAGES.adminApproved(member, label), components: [] });
    await updatePublicMessage(MESSAGES.publicApproved(member, label), '✅');
    await member.send(MESSAGES.dmApproved(label)).catch(() => { });
  } catch (err) {
    console.error('역할 부여 실패:', err.message);
    await interaction.reply({ content: MESSAGES.roleError, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { commands, handle };
