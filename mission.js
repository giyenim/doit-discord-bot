const fs = require('node:fs');
const path = require('node:path');
const {
  EmbedBuilder,
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const TIMEZONE = 'Asia/Seoul';

const STUDIES = {
  opt1: {
    channelId: process.env.PROGRESS_CHANNEL_ID_OPTION_1,
    roleId: process.env.ROLE_ID_OPTION_1,
    label: process.env.ROLE_LABEL_OPTION_1,
    color: 0x1abc9c,
    progressFile: path.join(__dirname, 'data', 'progress-option1.json'),
    missionFile: path.join(__dirname, 'data', 'mission-option1.json'),
    forumTagId: process.env.MISSION_FORUM_TAG_ID_OPTION_1,
  },
  opt2: {
    channelId: process.env.PROGRESS_CHANNEL_ID_OPTION_2,
    roleId: process.env.ROLE_ID_OPTION_2,
    label: process.env.ROLE_LABEL_OPTION_2,
    color: 0x3498db,
    progressFile: path.join(__dirname, 'data', 'progress-option2.json'),
    missionFile: path.join(__dirname, 'data', 'mission-option2.json'),
    forumTagId: process.env.MISSION_FORUM_TAG_ID_OPTION_2,
  },
};

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function findStudyByChannel(channelId) {
  for (const [optKey, study] of Object.entries(STUDIES)) {
    if (study.channelId && study.channelId === channelId) {
      return { optKey, study };
    }
  }
  return null;
}

function currentWeek(progressData, today) {
  let best = null;
  for (const dateKey of Object.keys(progressData)) {
    if (dateKey <= today && (best === null || dateKey > best)) {
      best = dateKey;
    }
  }
  if (best === null) return null;
  const week = progressData[best].week;
  return Number.isInteger(week) ? week : null;
}

function missingWeeksFor(userId, missionData, currentWeek) {
  const missing = [];
  for (let w = 1; w <= currentWeek; w++) {
    const entry = missionData[String(w)];
    if (!entry) continue;
    const completed = entry.completed || [];
    if (!completed.includes(userId)) missing.push(w);
  }
  return missing;
}

function studyProgress(missionData, roleMemberIds) {
  const weekKeys = Object.keys(missionData);
  const total = roleMemberIds.size * weekKeys.length;
  let done = 0;
  for (const key of weekKeys) {
    const completed = missionData[key].completed || [];
    for (const id of completed) {
      if (roleMemberIds.has(id)) done++;
    }
  }
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

function myProgress(userId, missionData) {
  const weekKeys = Object.keys(missionData);
  const total = weekKeys.length;
  let done = 0;
  for (const key of weekKeys) {
    const completed = missionData[key].completed || [];
    if (completed.includes(userId)) done++;
  }
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

function progressBar(percent, length = 10) {
  const filled = Math.round((percent / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

const commands = [
  new SlashCommandBuilder()
    .setName('미션현황')
    .setDescription('이번 주 스터디 미션 완료 현황을 확인합니다 (본인에게만 보임)')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('미션승인')
    .setDescription('인증 글 스레드 작성자의 해당 주차 미션을 토글합니다 (관리자 전용)')
    .addIntegerOption((option) =>
      option
        .setName('주차')
        .setDescription('승인/취소할 주차 번호')
        .setRequired(true)
        .setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === '미션현황') {
    const match = findStudyByChannel(interaction.channelId);
    if (!match) {
      await interaction.reply({
        content: '이 명령어는 스터디 채널에서만 사용할 수 있어요.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { optKey, study } = match;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await runMissionStatus(interaction, optKey, study);
    } catch (err) {
      console.error(`[미션현황] ${optKey} 처리 실패:`, err);
      await interaction.editReply({
        content: '미션 현황을 불러오지 못했어요. 😵 잠시 후 다시 시도해주세요.',
      }).catch(() => { });
    }
    return;
  }

  if (interaction.commandName === '미션승인') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await runMissionApprove(interaction);
    } catch (err) {
      console.error('[미션승인] 처리 실패:', err);
      await interaction.editReply({
        content: '미션 승인 처리 중 오류가 발생했어요. 😵 잠시 후 다시 시도해주세요.',
      }).catch(() => { });
    }
    return;
  }
}

async function runMissionStatus(interaction, optKey, study) {
  const today = todayInSeoul();

  const progressData = loadJson(study.progressFile);
  const week = currentWeek(progressData, today);
  if (week === null) {
    await interaction.editReply({
      content: `[${study.label}] 스터디는 아직 시작되지 않았어요. 첫 진도일을 기다려 주세요.`,
    });
    return;
  }

  const lastWeek = week - 1;
  const isFirstWeek = lastWeek < 1;

  const missionData = loadJson(study.missionFile);
  const lastWeekEntry = isFirstWeek ? null : missionData[String(lastWeek)];
  if (!isFirstWeek && !lastWeekEntry) {
    await interaction.editReply({
      content: `[${study.label}] ${lastWeek}주차 미션 데이터를 찾을 수 없어요. 관리자에게 문의해 주세요.`,
    });
    return;
  }

  if (interaction.guild.members.cache.size < interaction.guild.memberCount) {
    await interaction.guild.members.fetch();
  }
  const role = await interaction.guild.roles.fetch(study.roleId);
  if (!role) {
    await interaction.editReply({
      content: '스터디 역할을 찾을 수 없어요. 관리자에게 문의해 주세요.',
    });
    return;
  }

  const roleMembers = [...role.members.values()];
  const total = roleMembers.length;
  if (total === 0) {
    await interaction.editReply({
      content: `[${study.label}] 역할을 가진 멤버가 아직 없어요.`,
    });
    return;
  }

  const roleMemberIds = new Set(roleMembers.map((m) => m.id));
  const me = roleMembers.find((m) => m.id === interaction.user.id);
  const myDisplayName = me.displayName;

  let myLine;
  if (isFirstWeek) {
    myLine = `**${myDisplayName}**님은 아직 완료한 주차가 없어요.`;
  } else {
    const myMissing = missingWeeksFor(interaction.user.id, missionData, lastWeek);
    myLine = myMissing.length === 0
      ? `**${myDisplayName}**님은 ${lastWeek}주차 미션까지 완료했어요. ╰(*°▽°*)╯`
      : `**${myDisplayName}**님은 미완료 미션이 있어요. ┗( T﹏T )┛\n [미완료: ${myMissing.map((w) => `Week ${w}`).join(', ')}]`;
  }

  const chaptersLine = isFirstWeek
    ? '**지난 주 챕터:** (아직 없음)'
    : `**지난 주 챕터:** ${lastWeekEntry.chapters || '(미정)'}`;
  const doneLine = isFirstWeek
    ? '**지난 주 미션 완료 인원:** (아직 없음)'
    : `**지난 주 미션 완료 인원:** ${(lastWeekEntry.completed || []).filter((id) => roleMemberIds.has(id)).length} / ${total}명`;

  const { percent: studyPercent } = studyProgress(missionData, roleMemberIds);
  const { percent: myPercent } = myProgress(interaction.user.id, missionData);

  const lines = [
    myLine,
    '',
    chaptersLine,
    doneLine,
    `**내 스터디 완료율:** ${progressBar(myPercent)} ${myPercent}%`,
    `**전체 스터디 완료율:** ${progressBar(studyPercent)} ${studyPercent}%`,
  ];

  const embed = new EmbedBuilder()
    .setColor(study.color)
    .setTitle(`🖥️ [${study.label}] 미션 현황`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${today} 기준` });

  await interaction.editReply({ embeds: [embed] });
}

async function runMissionApprove(interaction) {
  const channel = interaction.channel;

  if (!channel?.isThread() || channel.parent?.type !== ChannelType.GuildForum
      || channel.parentId !== process.env.MISSION_FORUM_CHANNEL_ID) {
    await interaction.editReply({
      content: '이 명령어는 미션 인증 포럼 스레드에서만 사용할 수 있어요.',
    });
    return;
  }

  const appliedTags = channel.appliedTags || [];
  const matchedKeys = Object.entries(STUDIES)
    .filter(([, study]) => study.forumTagId && appliedTags.includes(study.forumTagId))
    .map(([optKey]) => optKey);

  if (matchedKeys.length === 0) {
    await interaction.editReply({
      content: '스레드에 스터디 태그(옵션1/2)가 없어요. 태그를 추가한 뒤 다시 시도해 주세요.',
    });
    return;
  }
  if (matchedKeys.length > 1) {
    await interaction.editReply({
      content: '스레드에 옵션1과 옵션2 태그가 모두 있어요. 하나만 남기고 다시 시도해 주세요.',
    });
    return;
  }

  const optKey = matchedKeys[0];
  const study = STUDIES[optKey];
  const userId = channel.ownerId;
  const week = interaction.options.getInteger('주차');

  const missionData = loadJson(study.missionFile);
  const weekEntry = missionData[String(week)];
  if (!weekEntry) {
    await interaction.editReply({
      content: `[${study.label}] ${week}주차 미션 데이터를 찾을 수 없어요. 관리자에게 문의해 주세요.`,
    });
    return;
  }

  if (!Array.isArray(weekEntry.completed)) weekEntry.completed = [];
  const idx = weekEntry.completed.indexOf(userId);
  const isApproving = idx === -1;
  if (isApproving) {
    weekEntry.completed.push(userId);
  } else {
    weekEntry.completed.splice(idx, 1);
  }

  fs.writeFileSync(study.missionFile, JSON.stringify(missionData, null, 2));

  let displayName = userId;
  try {
    const member = await interaction.guild.members.fetch(userId);
    displayName = member.displayName;
  } catch {}

  const verb = isApproving ? '승인 완료' : '취소';
  await interaction.editReply({
    content: `[${study.label}] ${displayName} ${week}주차 ${verb}`,
  });
}

module.exports = {
  commands,
  handle,
  _test: { currentWeek, todayInSeoul, missingWeeksFor, studyProgress, myProgress, progressBar },
};
