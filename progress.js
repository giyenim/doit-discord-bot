const fs = require('node:fs');
const path = require('node:path');
const cron = require('node-cron');
const { EmbedBuilder, SlashCommandBuilder, MessageFlags } = require('discord.js');

const TIMEZONE = 'Asia/Seoul';

const STUDIES = {
  opt1: {
    channelId: process.env.PROGRESS_CHANNEL_ID_OPTION_1,
    cronExpr: process.env.PROGRESS_CRON_OPTION_1,
    color: 0x1abc9c,
    dataFile: path.join(__dirname, 'data', 'progress-option1.json'),
  },
  opt2: {
    channelId: process.env.PROGRESS_CHANNEL_ID_OPTION_2,
    cronExpr: process.env.PROGRESS_CRON_OPTION_2,
    color: 0x3498db,
    dataFile: path.join(__dirname, 'data', 'progress-option2.json'),
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

function loadProgress(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function buildEmbed(study, dateKey, entry) {
  return new EmbedBuilder()
    .setColor(study.color)
    .setTitle(`📚 ${entry.title}`)
    .setDescription(entry.body)
    .setFooter({ text: dateKey });
}

function previewForToday(optKey) {
  const study = STUDIES[optKey];
  if (!study) throw new Error(`알 수 없는 스터디 키: ${optKey}`);
  const dateKey = todayInSeoul();
  const data = loadProgress(study.dataFile);
  const entry = data[dateKey];
  if (!entry) return null;
  return buildEmbed(study, dateKey, entry).toJSON();
}

async function sendProgressFor(client, optKey) {
  const study = STUDIES[optKey];
  const dateKey = todayInSeoul();

  let data;
  try {
    data = loadProgress(study.dataFile);
  } catch (err) {
    console.error(`[진도] ${optKey} 데이터 파일 로드 실패:`, err.message);
    return;
  }

  const entry = data[dateKey];
  if (!entry) {
    console.log(`[진도] ${optKey} ${dateKey} 항목 없음, 스킵`);
    return;
  }

  try {
    const channel = await client.channels.fetch(study.channelId);
    const embed = buildEmbed(study, dateKey, entry);
    await channel.send({ embeds: [embed] });
    console.log(`[진도] ${optKey} ${dateKey} 공지 완료`);
  } catch (err) {
    console.error(`[진도] ${optKey} 공지 실패:`, err.message);
  }
}

function init(client) {
  for (const [optKey, study] of Object.entries(STUDIES)) {
    if (!study.cronExpr || !study.channelId) {
      console.warn(`[진도] ${optKey} 설정 누락 (cron 또는 채널 ID), 등록 스킵`);
      continue;
    }
    if (!cron.validate(study.cronExpr)) {
      console.warn(`[진도] ${optKey} cron 표현식 잘못됨: ${study.cronExpr}, 등록 스킵`);
      continue;
    }
    cron.schedule(study.cronExpr, () => sendProgressFor(client, optKey), {
      timezone: TIMEZONE,
    });
    console.log(`[진도] ${optKey} 등록 완료 (${study.cronExpr}, ${TIMEZONE})`);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('진도')
    .setDescription('오늘 스터디 진도를 확인합니다 (본인에게만 보임)')
    .toJSON(),
];

function findStudyByChannel(channelId) {
  for (const [optKey, study] of Object.entries(STUDIES)) {
    if (study.channelId && study.channelId === channelId) {
      return { optKey, study };
    }
  }
  return null;
}

async function handle(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== '진도') {
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
  const dateKey = todayInSeoul();

  let data;
  try {
    data = loadProgress(study.dataFile);
  } catch (err) {
    console.error(`[진도] ${optKey} 데이터 파일 로드 실패:`, err.message);
    await interaction.reply({
      content: '진도 정보를 불러오지 못했어요. 😵 잠시 후 다시 시도해주세요.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const entry = data[dateKey];
  if (!entry) {
    await interaction.reply({
      content: `오늘(${dateKey})은 진도가 없는 날이에요.\n그동안 배운 내용을 복습하거나, 잠시 숨 고르는 시간을 가져보세요.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = buildEmbed(study, dateKey, entry);
  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { commands, handle, init, previewForToday };
