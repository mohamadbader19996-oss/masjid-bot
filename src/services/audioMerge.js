const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');
const { getAyahAudio } = require('./quranApi');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

function ayahKey(surah, ayah) {
  return `${surah}_${ayah}`;
}

function toFfmpegPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

async function downloadAyahToFile(surah, ayah, reciterId, destPath) {
  const data = await getAyahAudio(surah, ayah, reciterId);
  if (!data?.audio) {
    throw new Error(`تعذّر جلب صوت ${surah}:${ayah}`);
  }
  const res = await axios.get(data.audio, {
    responseType: 'stream',
    timeout: 120000,
    validateStatus: (status) => status === 200
  });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    res.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
    res.data.on('error', reject);
  });
}

function mergeFilesInOrder(inputPaths, outputPath) {
  const listPath = path.join(path.dirname(outputPath), 'concat_list.txt');
  const lines = inputPaths.map((p) => `file '${toFfmpegPath(p).replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(listPath, lines.join(os.EOL), 'utf8');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

async function buildMergedAudioFile(sequence, reciterId, userId = 'test') {
  const folderPath = path.join(process.cwd(), 'temp', 'hafiz', `${userId}_${Date.now()}`);
  fs.mkdirSync(folderPath, { recursive: true });

  const downloaded = {};
  for (const { surah, ayah } of sequence) {
    const key = ayahKey(surah, ayah);
    if (downloaded[key]) continue;
    const filePath = path.join(folderPath, `${key}.mp3`);
    await downloadAyahToFile(surah, ayah, reciterId, filePath);
    downloaded[key] = filePath;
  }

  const orderedPaths = sequence.map(({ surah, ayah }) => downloaded[ayahKey(surah, ayah)]);
  const mergedPath = path.join(folderPath, 'merged.mp3');
  await mergeFilesInOrder(orderedPaths, mergedPath);

  return { mergedPath, folderPath };
}

function cleanupTempFolder(folderPath) {
  if (!folderPath) return;
  try {
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('cleanupTempFolder error:', e.message);
  }
}

function probeDurationSeconds(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data?.format?.duration || 0);
    });
  });
}

module.exports = {
  buildMergedAudioFile,
  cleanupTempFolder,
  probeDurationSeconds
};
