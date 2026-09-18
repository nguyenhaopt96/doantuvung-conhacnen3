import fs from 'fs';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

interface FfmpegResult {
  duration: number;
  stderr: string;
}

function parseFfmpegTime(value: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseFloat(match[3]);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total >= 0 ? total : null;
}

function runFfmpeg(args: string[], action: string, timeoutMs = 10 * 60 * 1000): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('Máy chủ thiếu FFmpeg để xử lý tệp media.'));
      return;
    }

    const proc = spawn(ffmpegPath, args);
    const stderrLines: string[] = [];
    let pendingStdout = '';
    let pendingStderr = '';
    let duration = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const rememberStderr = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      stderrLines.push(trimmed);
      if (stderrLines.length > 30) stderrLines.shift();
    };

    const readProgressLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('out_time=')) return;
      const parsed = parseFfmpegTime(trimmed.slice('out_time='.length));
      if (parsed !== null) duration = Math.max(duration, parsed);
    };

    proc.stdout.on('data', (chunk: Buffer) => {
      pendingStdout += chunk.toString();
      const lines = pendingStdout.split('\n');
      pendingStdout = lines.pop() || '';
      lines.forEach(readProgressLine);
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      pendingStderr += chunk.toString();
      const lines = pendingStderr.split('\n');
      pendingStderr = lines.pop() || '';
      lines.forEach(rememberStderr);
    });

    timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process may already have stopped.
      }
      finishReject(new Error(`${action} quá thời gian cho phép.`));
    }, timeoutMs);

    proc.once('error', (error) => {
      finishReject(new Error(`${action} không thể khởi chạy FFmpeg: ${error.message}`));
    });

    proc.once('close', (code) => {
      if (settled) return;
      if (pendingStdout.trim()) readProgressLine(pendingStdout);
      if (pendingStderr.trim()) rememberStderr(pendingStderr);
      clearTimeout(timer);

      if (code !== 0) {
        const detail = stderrLines.join('\n');
        finishReject(new Error(`${action} thất bại${detail ? `: ${detail}` : '.'}`));
        return;
      }

      settled = true;
      resolve({ duration, stderr: stderrLines.join('\n') });
    });
  });
}

export async function measureAudioDuration(filePath: string): Promise<number> {
  const result = await runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostats',
      '-progress',
      'pipe:1',
      '-i',
      filePath,
      '-map',
      '0:a:0',
      '-vn',
      '-f',
      'null',
      '-',
    ],
    'Không đọc được thời lượng âm thanh'
  );

  if (!Number.isFinite(result.duration) || result.duration <= 0) {
    throw new Error('Tệp không có luồng âm thanh hoặc thời lượng hợp lệ.');
  }
  return result.duration;
}

export async function extractAudioToM4a(inputPath: string, outputPath: string): Promise<number> {
  const result = await runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostats',
      '-progress',
      'pipe:1',
      '-i',
      inputPath,
      '-map',
      '0:a:0',
      '-vn',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ],
    'Không lấy được âm thanh từ tệp đã chọn'
  );

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
    throw new Error('FFmpeg không tạo được tệp âm thanh đầu ra.');
  }

  return result.duration > 0 ? result.duration : measureAudioDuration(outputPath);
}

export async function verifyAudioVideoMedia(filePath: string): Promise<void> {
  await runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostats',
      '-i',
      filePath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-t',
      '0.25',
      '-f',
      'null',
      '-',
    ],
    'Xác thực video đầu ra'
  );
}
