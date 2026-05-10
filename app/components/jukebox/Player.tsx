import React, { useEffect, useRef, useState } from 'react';
import { VolumeIcon } from '~/routes/utils/jukeboxMetadata';
import MarqueeText from './MarqueeText';
import { TbPlayerTrackNextFilled } from 'react-icons/tb';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const getYouTubeId = (url: string): string | null => url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2] || null;

export interface PlayerProps {
  song: any | null;
  onClose: () => void;
  onSongEnd: (player: any) => void;
  onTitleClick: (id: string) => void;
  onNextSong: () => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const Player: React.FC<PlayerProps> = React.memo(({ song, onClose, onSongEnd, onTitleClick, onNextSong }) => {
  const playerRef = useRef<any>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem('jukebox-volume');
    return saved !== null ? Number(saved) : 100;
  });
  const [showVolume, setShowVolume] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Auto-expand on new song so ads are always visible and skippable
  useEffect(() => {
    if (song) {
      setIsExpanded(true);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [song?.id]);

  // Poll playback position when collapsed
  useEffect(() => {
    if (!isPlaying /* || isExpanded */) return;
    const timer = setInterval(() => {
      setCurrentTime(playerRef.current?.getCurrentTime?.() ?? 0);
      setDuration(playerRef.current?.getDuration?.() ?? 0);
    }, 500);
    return () => clearInterval(timer);
  }, [isPlaying, isExpanded]);

  useEffect(() => {
    if (!showVolume) return;
    const handler = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) setShowVolume(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVolume]);

  useEffect(() => {
    const videoId = song?.youtube_url ? getYouTubeId(song.youtube_url) : null;
    if (!videoId) {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      return;
    }
    const initPlayer = () => {
      if (playerRef.current) playerRef.current.destroy();
      playerRef.current = new window.YT.Player('youtube-player', {
        videoId,
        height: '100%',
        width: '100%',
        playerVars: { autoplay: 1, controls: 1 },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(volume);
            setIsPlaying(true);
          },
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.PLAYING) setIsPlaying(true);
            else if (e.data === window.YT.PlayerState.PAUSED) setIsPlaying(false);
            else if (e.data === window.YT.PlayerState.ENDED) {
              setIsPlaying(false);
              onSongEnd(e.target);
            }
          },
        },
      });
    };
    if (window.YT?.Player) initPlayer();
    else window.onYouTubeIframeAPIReady = initPlayer;
  }, [song, onSongEnd]);

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    localStorage.setItem('jukebox-volume', String(v));
    playerRef.current?.setVolume(v);
  };

  if (!song) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:bottom-4 md:right-4 md:left-auto md:w-100 md:rounded-xl md:overflow-hidden md:shadow-2xl">
      {/* YouTube iframe — collapsed via max-height so audio/ads remain accessible */}
      <div className="overflow-hidden transition-all duration-300 ease-in-out bg-black" style={{ maxHeight: isExpanded ? '360px' : 0 }}>
        <div className="relative aspect-video w-full max-h-[360px] max-w-[640px] mx-auto">
          <div id="youtube-player" className="absolute inset-0 w-full h-full" />
          <div ref={volumeRef} className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10">
            {showVolume && (
              <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1">
                <input type="range" min={0} max={100} value={volume} onChange={(e) => handleVolumeChange(Number(e.target.value))} className="w-20 h-1 accent-sky-400 cursor-pointer" />
                <span className="text-[10px] text-white/80 w-5 text-right">{volume}</span>
              </div>
            )}
            <button
              onClick={() => setShowVolume((v) => !v)}
              className={`p-1.5 rounded-md backdrop-blur-sm transition-colors ${showVolume ? 'bg-sky-500/80 text-white' : 'bg-black/60 text-white/70 hover:text-white'}`}
            >
              <VolumeIcon volume={volume} />
            </button>
          </div>
        </div>
      </div>

      {/* Persistent bar */}
      <div className="relative bg-white/95 dark:bg-slate-900/97 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700/80 flex items-center gap-2 px-3 py-2">
        {/* Progress bar — collapsed only */}
        {
          /*! isExpanded && */ duration > 0 && (
            <div
              className="absolute top-0 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-700 cursor-pointer group/progress"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                const target = ratio * duration;
                playerRef.current?.seekTo(target, true);
                setCurrentTime(target);
              }}
            >
              <div className="h-full bg-sky-500 transition-none" style={{ width: `${(currentTime / duration) * 100}%` }} />
            </div>
          )
        }
        <button
          onClick={() => setIsExpanded((p) => !p)}
          className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          title={isExpanded ? 'Minimize' : 'Expand'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            {isExpanded ? <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />}
          </svg>
        </button>

        <div className="flex-1 min-w-0 cursor-pointer group" onClick={() => onTitleClick(song.id)}>
          <MarqueeText
            text={song.title || `BGM ${song.id}`}
            className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors"
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {`${Number(song.id) < 10000 ? '#' + song.id + ' ' : ''}${
              song.composer
                ?.split('/')
                .map((v: string) => '#' + v.trim().replace(/\s/gi, '_'))
                .join(' ') || ''
            }`}
          </p>
        </div>

        {/* Time display — collapsed only */}
        {!isExpanded && duration > 0 && (
          <span className="shrink-0 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
            {formatTime(currentTime)}
            <span className="opacity-50">/{formatTime(duration)}</span>
          </span>
        )}

        {/* Play / Pause */}
        <button
          onClick={() => (isPlaying ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo())}
          className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Next song */}
        <button onClick={onNextSong} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors" title="Next">
          {/* <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zm8.5-6L23 6v12l-8.5-6z" />
          </svg> */}
          <TbPlayerTrackNextFilled className="h-4 w-4" />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
});

export default Player;
