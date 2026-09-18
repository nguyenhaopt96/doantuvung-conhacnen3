import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import busboy from 'busboy';
import { extractAudioToM4a } from './mediaTools';
import { runtimeStoragePath } from './runtimeStorage';

export interface MusicTrackRecord {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  duration: number;
  uploadedAt: string;
}

export interface MusicTrackForRender extends MusicTrackRecord {
  filePath: string;
}

const MUSIC_ROOT = runtimeStoragePath('music_library');
const MUSIC_INDEX_PATH = path.join(MUSIC_ROOT, 'library.json');
const MAX_TRACK_SIZE = 200 * 1024 * 1024;
const MAX_TRACKS_PER_UPLOAD = 50;
const TRACK_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const ALLOWED_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.webm',
  '.mp4',
  '.m4v',
  '.mov',
  '.mkv',
  '.avi',
  '.mpeg',
  '.mpg',
  '.3gp',
]);

const tracks = new Map<string, MusicTrackRecord>();
let initialized = false;

function publicTrack(track: MusicTrackRecord) {
  return {
    id: track.id,
    originalName: track.originalName,
    mimeType: track.mimeType,
    size: track.size,
    duration: track.duration,
    uploadedAt: track.uploadedAt,
  };
}

function trackPath(track: MusicTrackRecord): string {
  return path.join(MUSIC_ROOT, path.basename(track.storedName));
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  fs.mkdirSync(MUSIC_ROOT, { recursive: true });

  if (!fs.existsSync(MUSIC_INDEX_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(MUSIC_INDEX_PATH, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Music index is not an array');

    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue;
      const track = value as MusicTrackRecord;
      if (!TRACK_ID_PATTERN.test(track.id || '')) continue;
      if (!track.storedName || path.basename(track.storedName) !== track.storedName) continue;
      if (!track.originalName || !Number.isFinite(track.size) || !Number.isFinite(track.duration)) continue;
      if (!fs.existsSync(trackPath(track))) continue;
      tracks.set(track.id, track);
    }
  } catch (error) {
    console.warn('Could not load music library index:', error);
  }
}

function persistIndex(): void {
  ensureInitialized();
  const temporary = `${MUSIC_INDEX_PATH}.tmp`;
  const values = Array.from(tracks.values()).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  fs.writeFileSync(temporary, JSON.stringify(values, null, 2), 'utf8');
  fs.renameSync(temporary, MUSIC_INDEX_PATH);
}

function removeQuietly(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup for incomplete uploads.
  }
}

function safeOriginalName(value: string): string {
  const base = path.basename(value || 'nhac-nen').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'nhac-nen').slice(0, 240);
}

export function listMusicTracksForRender(): MusicTrackForRender[] {
  ensureInitialized();
  return Array.from(tracks.values())
    .filter((track) => fs.existsSync(trackPath(track)))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .map((track) => ({ ...track, filePath: trackPath(track) }));
}

export function getMusicTrackForRender(trackId: string): MusicTrackForRender | null {
  ensureInitialized();
  const track = tracks.get(trackId);
  if (!track) return null;
  const filePath = trackPath(track);
  if (!fs.existsSync(filePath)) return null;
  return { ...track, filePath };
}

function sendTrack(res: Response, track: MusicTrackRecord): void {
  const filePath = trackPath(track);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Bài nhạc không còn trên máy chủ.' });
    return;
  }

  const stat = fs.statSync(filePath);
  const range = res.req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Type', track.mimeType || 'application/octet-stream');

  if (!range) {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
    res.end();
    return;
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
  const end = Math.min(requestedEnd, stat.size - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= stat.size) {
    res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
    res.end();
    return;
  }

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function registerUploadRoute(app: Express): void {
  app.post('/api/music-tracks', (req: Request, res: Response) => {
    ensureInitialized();
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    const pending: Array<{
      id: string;
      originalName: string;
      temporaryPath: string;
      truncated: boolean;
    }> = [];
    const writePromises: Promise<void>[] = [];
    let parserError: string | null = null;
    let requestAborted = false;

    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_TRACK_SIZE,
          files: MAX_TRACKS_PER_UPLOAD,
          fields: 0,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: `Không đọc được yêu cầu tải media: ${error?.message || 'lỗi không xác định'}` });
      return;
    }

    req.once('aborted', () => {
      requestAborted = true;
    });

    parser.on('file', (_fieldName: string, file: NodeJS.ReadableStream, info: { filename: string; mimeType?: string }) => {
      const originalName = safeOriginalName(info.filename);
      const extension = path.extname(originalName).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        parserError = `Tệp “${originalName}” không thuộc định dạng âm thanh/video được hỗ trợ.`;
        file.resume();
        return;
      }

      const id = crypto.randomUUID();
      const temporaryPath = path.join(MUSIC_ROOT, `${id}.upload`);
      const item = {
        id,
        originalName,
        temporaryPath,
        truncated: false,
      };
      pending.push(item);

      const output = fs.createWriteStream(temporaryPath, { flags: 'wx' });
      writePromises.push(new Promise<void>((resolve, reject) => {
        output.once('finish', resolve);
        output.once('error', reject);
        file.once('error', reject);
      }));
      file.on('limit', () => {
        item.truncated = true;
      });
      file.pipe(output);
    });

    parser.on('filesLimit', () => {
      parserError = `Mỗi lần chỉ được tải tối đa ${MAX_TRACKS_PER_UPLOAD} tệp.`;
    });
    parser.on('error', (error: Error) => {
      parserError = `Lỗi đọc dữ liệu media: ${error.message}`;
    });

    parser.on('close', async () => {
      const cleanupPending = () => pending.forEach((item) => removeQuietly(item.temporaryPath));
      try {
        await Promise.all(writePromises);
        if (requestAborted) {
          cleanupPending();
          return;
        }
        if (parserError) {
          cleanupPending();
          res.status(400).json({ error: parserError });
          return;
        }
        if (pending.length === 0) {
          res.status(400).json({ error: 'Chưa nhận được tệp âm thanh/video hợp lệ nào.' });
          return;
        }

        const created: MusicTrackRecord[] = [];
        const errors: string[] = [];
        for (const item of pending) {
          const storedName = `${item.id}.m4a`;
          const storedPath = path.join(MUSIC_ROOT, storedName);
          try {
            if (item.truncated) throw new Error('vượt quá giới hạn 200 MiB');
            const stat = fs.statSync(item.temporaryPath);
            if (stat.size <= 0) throw new Error('tệp rỗng');
            const duration = await extractAudioToM4a(item.temporaryPath, storedPath);
            const outputStat = fs.statSync(storedPath);
            const track: MusicTrackRecord = {
              id: item.id,
              originalName: item.originalName,
              storedName,
              mimeType: 'audio/mp4',
              size: outputStat.size,
              duration: Math.round(duration * 10) / 10,
              uploadedAt: new Date().toISOString(),
            };
            tracks.set(track.id, track);
            created.push(track);
          } catch (error: any) {
            removeQuietly(storedPath);
            errors.push(`${item.originalName}: ${error?.message || 'không lưu được'}`);
          } finally {
            removeQuietly(item.temporaryPath);
          }
        }

        if (created.length > 0) persistIndex();
        if (created.length === 0) {
          res.status(400).json({ error: errors[0] || 'Không lưu được tệp âm thanh nào.', errors });
          return;
        }
        res.status(201).json({ tracks: created.map(publicTrack), errors });
      } catch (error: any) {
        cleanupPending();
        if (!res.headersSent) {
          res.status(500).json({ error: error?.message || 'Không thể lưu âm thanh trên máy chủ.' });
        }
      }
    });

    req.pipe(parser);
  });
}

export function registerMusicLibraryRoutes(app: Express): void {
  ensureInitialized();

  app.get('/api/music-tracks', (_req, res) => {
    const values = listMusicTracksForRender().map(publicTrack);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ tracks: values });
  });

  registerUploadRoute(app);

  app.get('/api/music-tracks/:trackId/stream', (req, res) => {
    const track = tracks.get(req.params.trackId);
    if (!track || !TRACK_ID_PATTERN.test(req.params.trackId)) {
      res.status(404).json({ error: 'Không tìm thấy bài nhạc.' });
      return;
    }
    sendTrack(res, track);
  });

  app.delete('/api/music-tracks/:trackId', (req, res) => {
    const trackId = req.params.trackId;
    const track = tracks.get(trackId);
    if (!track || !TRACK_ID_PATTERN.test(trackId)) {
      res.status(404).json({ error: 'Không tìm thấy bài nhạc.' });
      return;
    }
    try {
      removeQuietly(trackPath(track));
      tracks.delete(trackId);
      persistIndex();
      res.status(204).end();
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Không xóa được bài nhạc.' });
    }
  });
}
