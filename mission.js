const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, SlashCommandBuilder, MessageFlags } = require('discord.js');

const TIMEZONE = 'Asia/Seoul';

const STUDIES = {
  opt1: {
    channelId: process.env.PROGRESS_CHANNEL_ID_OPTION_1,
    roleId: process.env.ROLE_ID_OPTION_1,
    label: process.env.ROLE_LABEL_OPTION_1,
    color: 0x1abc9c,
    progressFile: path.join(__dirname, 'data', 'progress-option1.json'),
    missionFile: path.join(__dirname, 'data', 'mission-option1.json'),
  },
  opt2: {
    channelId: process.env.PROGRESS_CHANNEL_ID_OPTION_2,
    roleId: process.env.ROLE_ID_OPTION_2,
    label: process.env.ROLE_LABEL_OPTION_2,
    color: 0x3498db,
    progressFile: path.join(__dirname, 'data', 'progress-option2.json'),
    missionFile: path.join(__dirname, 'data', 'mission-option2.json'),
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

function formatMemberList(displayNames, maxShown = 3) {
  if (displayNames.length === 0) return '없음';
  if (displayNames.length <= maxShown) return displayNames.join(', ');
  const shown = displayNames.slice(0, maxShown).join(', ');
  const rest = displayNames.length - maxShown;
  return `${shown} 외 ${rest}명`;
}

const commands = [
  new SlashCommandBuilder()
    .setName('미션현황')
    .setDescription('이번 주 스터디 미션 완료 현황을 확인합니다 (본인에게만 보임)')
    .toJSON(),
];

async function handle(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== '미션현황') {
    return;
  }

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

  const missionData = loadJson(study.missionFile);
  const weekEntry = missionData[String(week)];
  if (!weekEntry) {
    await interaction.editReply({
      content: `[${study.label}] ${week}주차 미션이 아직 등록되지 않았어요.`,
    });
    return;
  }

  await interaction.guild.members.fetch();
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

  const completedSet = new Set(weekEntry.completed || []);
  const completed = [];
  const pending = [];
  for (const member of roleMembers) {
    if (completedSet.has(member.id)) completed.push(member);
    else pending.push(member);
  }

  const byName = (a, b) => a.displayName.localeCompare(b.displayName, 'ko');
  completed.sort(byName);
  pending.sort(byName);

  const percent = Math.round((completed.length / total) * 100);
  const youCompleted = completedSet.has(interaction.user.id);
  const youInStudy = roleMembers.some((m) => m.id === interaction.user.id);

  const lines = [
    `📖 **이번 주 챕터:** ${weekEntry.chapters || '(미정)'}`,
    `📊 **전체 완료율:** ${percent}% (${completed.length}/${total}명)`,
  ];
  if (youInStudy) {
    lines.push(`👤 **당신:** ${youCompleted ? '✅ 완료' : '⬜ 미완료'}`);
  }
  lines.push('');
  lines.push(`✅ **완료 (${completed.length}명):** ${formatMemberList(completed.map((m) => m.displayName))}`);
  lines.push(`⬜ **미완료 (${pending.length}명):** ${formatMemberList(pending.map((m) => m.displayName))}`);

  const embed = new EmbedBuilder()
    .setColor(study.color)
    .setTitle(`📋 [${study.label}] ${week}주차 현황`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${today} 기준` });

  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  commands,
  handle,
  _test: { currentWeek, formatMemberList, todayInSeoul },
};
