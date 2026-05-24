const fs = require('node:fs');
const path = require('node:path');
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

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

const commands = [];

async function handle() {
  return;
}

module.exports = { commands, handle, init, previewForToday };
