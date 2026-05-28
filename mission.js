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
      content: `[${study.label}] ${week}주차 미션 데이터를 찾을 수 없어요. 관리자에게 문의해 주세요.`,
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

  const thisWeekDone = (weekEntry.completed || []).filter((id) => roleMemberIds.has(id)).length;

  const myMissing = missingWeeksFor(interaction.user.id, missionData, week);
  const myLine = myMissing.length === 0
    ? `**${myDisplayName}**님은 ${week}주차 미션까지 완료했어요. ╰(*°▽°*)╯`
    : `**${myDisplayName}**님은 미완료 미션이 있어요. ┗( T﹏T )┛\n [미완료: ${myMissing.map((w) => `Week ${w}`).join(', ')}]`;

  const { percent: studyPercent } = studyProgress(missionData, roleMemberIds);
  const { percent: myPercent } = myProgress(interaction.user.id, missionData);

  const lines = [
    myLine,
    '',
    `**이번 주 챕터:** ${weekEntry.chapters || '(미정)'}`,
    `**이번 주 미션 완료 인원:** ${thisWeekDone} / ${total}명`,
    `**내 스터디 완료율:** ${progressBar(myPercent)} ${myPercent}%`,
    `**전체 스터디 완료율:** ${progressBar(studyPercent)} ${studyPercent}%`,
  ];

  const embed = new EmbedBuilder()
    .setColor(study.color)
    .setTitle(`🖥️ [${study.label}] ${week}주차 현황`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${today} 기준` });

  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  commands,
  handle,
  _test: { currentWeek, todayInSeoul, missingWeeksFor, studyProgress, myProgress, progressBar },
};
