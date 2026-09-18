import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Music2,
  Server,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import type { MusicTrack } from '../types';
import { deleteMusicTrack, musicStreamUrl, uploadMusicTracks } from '../lib/musicLibrary';

interface MusicTabProps {
  musicTracks: MusicTrack[];
  isLoading: boolean;
  onMusicUpdated: () => Promise<void> | void;
}

const SUPPORTED_MEDIA = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm|mp4|m4v|mov|mkv|avi|mpeg|mpg|3gp)$/i;
const MAX_TRACK_SIZE = 200 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(duration: number): string {
  const totalSeconds = Math.max(0, Math.round(duration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export const MusicTab: React.FC<MusicTabProps> = ({ musicTracks, isLoading, onMusicUpdated }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleFiles = async (source: FileList | File[]) => {
    const allFiles = Array.from(source);
    if (allFiles.length === 0) return;

    const invalid = allFiles.find((file) => !SUPPORTED_MEDIA.test(file.name));
    if (invalid) {
      setError(`“${invalid.name}” không phải định dạng âm thanh/video được hỗ trợ.`);
      return;
    }
    const oversized = allFiles.find((file) => file.size > MAX_TRACK_SIZE);
    if (oversized) {
      setError(`“${oversized.name}” vượt quá giới hạn 200 MiB.`);
      return;
    }

    setIsUploading(true);
    setUploadPercent(0);
    setError(null);
    setNotice(null);
    try {
      const result = await uploadMusicTracks(allFiles, (progress) => setUploadPercent(progress.percent));
      await onMusicUpdated();
      const successText = `Đã lấy âm thanh và lưu ${result.tracks.length} bài vào máy chủ.`;
      setNotice(result.errors.length > 0 ? `${successText} ${result.errors.length} tệp bị bỏ qua.` : successText);
      if (result.errors.length > 0) setError(result.errors.join(' · '));
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Không tải được tệp âm thanh/video lên máy chủ.');
    } finally {
      setIsUploading(false);
      setUploadPercent(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (trackId: string) => {
    setError(null);
    try {
      await deleteMusicTrack(trackId);
      setDeleteConfirmId(null);
      await onMusicUpdated();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Không xóa được bài nhạc.');
    }
  };

  return (
    <div className="mx-auto min-h-0 w-full max-w-5xl flex-1 space-y-5 overflow-y-auto p-3 text-slate-200 sm:p-5 md:space-y-6 md:p-8">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
        <Server className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <div className="text-xs leading-relaxed text-slate-300">
          <span className="font-semibold text-white">Kho nhạc dùng chung trên máy chủ. </span>
          Có thể tải file nhạc hoặc video có tiếng; máy chủ tự lấy riêng phần âm thanh để dùng lại. Khi dựng, chọn đúng một bài hoặc để máy tự chọn ngẫu nhiên cho từng video.
        </div>
      </div>

      {notice && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!isUploading) void handleFiles(event.dataTransfer.files);
        }}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`group rounded-3xl border-2 border-dashed p-5 text-center transition-all sm:p-8 ${
          isUploading
            ? 'cursor-wait border-orange-500/50 bg-orange-500/5'
            : 'cursor-pointer border-slate-700 bg-slate-900/50 hover:border-orange-500/60 hover:bg-slate-900/80'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.mp4,.m4v,.mov,.mkv,.avi,.mpeg,.mpg,.3gp"
          className="hidden"
          disabled={isUploading}
          onChange={(event) => event.target.files && void handleFiles(event.target.files)}
        />
        <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 transition-transform group-hover:scale-110">
          <UploadCloud className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-white">
          {isUploading ? `Đang tải và lấy âm thanh: ${uploadPercent}%` : 'Tải nhạc hoặc video có tiếng lên'}
        </h3>
        <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-slate-400">
          Chọn nhiều tệp cùng lúc. Hỗ trợ MP3, WAV, M4A, AAC, OGG, FLAC, MP4, MOV, WEBM, MKV, AVI, 3GP…; tối đa 200 MiB mỗi tệp.
        </p>
        {isUploading && (
          <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300 transition-all"
              style={{ width: `${uploadPercent}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 pt-2">
        <Music2 className="h-5 w-5 text-orange-400" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
          Kho nhạc nền ({musicTracks.length} bài)
        </h3>
      </div>

      {!isLoading && musicTracks.length === 0 && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-8 text-center sm:p-12">
          <Music2 className="mx-auto mb-3 h-12 w-12 text-slate-600" />
          <h4 className="text-sm font-semibold text-slate-300">Kho nhạc đang trống</h4>
          <p className="mt-1 text-xs text-slate-500">Tải nhạc lên rồi quay lại tab Tạo video để chọn bài hoặc chọn Random.</p>
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-center text-xs text-slate-400">
          Đang tải danh sách nhạc từ máy chủ...
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {musicTracks.map((track) => (
          <article key={track.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
            <div className="mb-3 flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                <Music2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white" title={track.originalName}>{track.originalName}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDuration(track.duration)}</span>
                  <span>{formatBytes(track.size)}</span>
                </div>
              </div>
            </div>

            <audio
              controls
              preload="metadata"
              src={musicStreamUrl(track.id)}
              className="h-9 w-full accent-orange-500"
            />

            {deleteConfirmId === track.id ? (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5">
                <p className="text-[11px] text-red-200">Xóa bài này khỏi kho máy chủ?</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-200"
                  >
                    Giữ lại
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(track.id)}
                    className="rounded-lg bg-red-600 px-2 py-1.5 text-[11px] font-bold text-white"
                  >
                    Xóa nhạc
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirmId(track.id)}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] font-semibold text-red-300 hover:bg-slate-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xóa khỏi máy chủ
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
};
