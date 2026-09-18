import type { MusicTrack } from '../types';

export interface MusicUploadProgress {
  percent: number;
  loaded: number;
  total: number;
}

export interface MusicUploadResult {
  tracks: MusicTrack[];
  errors: string[];
}

export async function fetchMusicTracks(): Promise<MusicTrack[]> {
  const response = await fetch('/api/music-tracks', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Không tải được kho nhạc (HTTP ${response.status}).`);
  const data = await response.json() as { tracks?: MusicTrack[] };
  return Array.isArray(data.tracks) ? data.tracks : [];
}

export function musicStreamUrl(trackId: string): string {
  return `/api/music-tracks/${encodeURIComponent(trackId)}/stream`;
}

export async function deleteMusicTrack(trackId: string): Promise<void> {
  const response = await fetch(`/api/music-tracks/${encodeURIComponent(trackId)}`, {
    method: 'DELETE',
  });
  if (response.status === 404) return;
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || `Không xóa được bài nhạc (HTTP ${response.status}).`);
  }
}

export async function uploadMusicTracks(
  files: File[],
  onProgress?: (progress: MusicUploadProgress) => void
): Promise<MusicUploadResult> {
  if (files.length === 0) throw new Error('Chưa chọn tệp âm thanh/video.');
  if (files.length > 50) throw new Error('Mỗi lần chỉ được tải tối đa 50 tệp.');

  const formData = new FormData();
  files.forEach((file) => formData.append('tracks', file, file.name));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/music-tracks', true);
    xhr.responseType = 'json';
    xhr.timeout = 10 * 60 * 1000;

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : 0;
      onProgress?.({
        percent: total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0,
        loaded: event.loaded,
        total,
      });
    };

    xhr.onload = () => {
      const data = xhr.response as { tracks?: MusicTrack[]; errors?: string[]; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          tracks: Array.isArray(data?.tracks) ? data.tracks : [],
          errors: Array.isArray(data?.errors) ? data.errors : [],
        });
        return;
      }
      reject(new Error(data?.error || `Không tải được tệp lên máy chủ (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Mất kết nối trong lúc tải tệp.'));
    xhr.ontimeout = () => reject(new Error('Quá thời gian tải tệp lên máy chủ.'));
    xhr.onabort = () => reject(new Error('Đã hủy tải tệp.'));
    xhr.send(formData);
  });
}
