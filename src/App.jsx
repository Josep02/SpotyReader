import React, { useState, useEffect, useRef } from 'react';
import { Music, Settings, LogOut, X, Sliders } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getToken, redirectToLogin, refreshAccessToken } from './lib/spotify';
import { fetchLyrics, parseLyrics } from './lib/lyrics';

const DEFAULT_SETTINGS = {
  activeSize: 4.5,
  inactiveSize: 1.5,
  albumSize: 400,
  titleSize: 2.2,
  smoothTransitions: false,
  cotodamaMode: false,
};

// --- VISTA ESTÁNDAR ---
const StandardView = ({ track, lyrics, currentLineIndex, settings }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current && currentLineIndex >= 0) {
      const el = scrollRef.current.children[currentLineIndex];
      if (el) {
        const containerH = scrollRef.current.parentElement.clientHeight;
        const offset = el.offsetTop - containerH / 2 + el.clientHeight / 2;
        scrollRef.current.style.transition = settings.smoothTransitions ? 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
        scrollRef.current.style.transform = `translateY(${-offset}px)`;
      }
    }
  }, [currentLineIndex, settings]);

  return (
    <div className="player-layout">
      <div className="track-info">
        {track ? (
          <motion.div key={track.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="track-card">
            <img src={track.album.images[0]?.url} className="album-art" style={{ maxWidth: `${settings.albumSize}px` }} />
            <div style={{ marginTop: '2rem' }}>
              <h1 style={{ fontSize: `${settings.titleSize}rem` }}>{track.name}</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>{track.artists.map(a => a.name).join(', ')}</p>
            </div>
          </motion.div>
        ) : (
          <div className="no-track-info"><Music size={80} opacity={0.2} /></div>
        )}
      </div>

      <div className="lyrics-container">
        <div className="lyrics-scroll" ref={scrollRef}>
          {lyrics.map((line, index) => (
            <div
              key={index}
              className={`lyric-line ${index === currentLineIndex ? 'active' : ''}`}
              style={{ 
                fontSize: index === currentLineIndex ? `${settings.activeSize}rem` : `${settings.inactiveSize}rem`,
                transformOrigin: 'left center'
              }}
            >
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- VISTA COTODAMA ---
const CotodamaView = ({ lyrics, currentLineIndex, settings }) => {
  const visibleRange = 3;
  const startIndex = Math.max(0, currentLineIndex - visibleRange);
  const endIndex = Math.min(lyrics.length, currentLineIndex + visibleRange + 1);

  return (
    <div className="cotodama-layout">
      <div className="lyrics-container">
        <AnimatePresence mode="popLayout">
          {lyrics.slice(startIndex, endIndex).map((line, i) => {
            const actualIndex = startIndex + i;
            const isActive = actualIndex === currentLineIndex;

            return (
              <motion.div
                key={`${actualIndex}-${line.text}`}
                initial={{ opacity: 0, y: 100, filter: 'blur(20px)' }}
                animate={{ 
                  opacity: isActive ? 1 : 0.05, 
                  y: 0, 
                  filter: isActive ? 'blur(0px)' : 'blur(10px)',
                  scale: isActive ? 1.1 : 0.9,
                }}
                exit={{ opacity: 0, y: -100, filter: 'blur(20px)' }}
                className={`lyric-line ${isActive ? 'active' : ''}`}
                style={{ fontSize: isActive ? `${settings.activeSize}rem` : `${settings.inactiveSize}rem` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              >
                {line.text}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('spotify_access_token'));
  const [track, setTrack] = useState(null);
  const [lyrics, setLyrics] = useState([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [showSettings, setShowSettings] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('spoty_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const lastTrackId = useRef(null);
  const lastSyncTime = useRef(0);
  const lastSpotifyProgress = useRef(0);
  const animationFrameRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('spoty_settings', JSON.stringify(settings));
  }, [settings]);

  // UI Auto-hide logic
  useEffect(() => {
    const handleMove = () => {
      setUiVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setUiVisible(false), 5000);
    };
    window.addEventListener('mousemove', handleMove);
    handleMove();
    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Sync and Auth logic (simplified here for brevity, keeping existing functionality)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !token) {
      getToken(code).then(data => {
        if (data.access_token) {
          localStorage.setItem('spotify_access_token', data.access_token);
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
          setToken(data.access_token);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      });
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const fetchPlayback = async () => {
      try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) { handleLogout(); return; }
        if (res.status === 204) return;
        const data = await res.json();
        const newTrack = data.item;
        if (!newTrack) return;
        setTrack(newTrack);
        setIsPlaying(data.is_playing);
        lastSpotifyProgress.current = data.progress_ms;
        lastSyncTime.current = performance.now();
        if (newTrack.id !== lastTrackId.current) {
          lastTrackId.current = newTrack.id;
          const lyricsData = await fetchLyrics(newTrack.name, newTrack.artists[0].name, newTrack.album.name, Math.floor(newTrack.duration_ms / 1000));
          if (lyricsData?.syncedLyrics) setLyrics(parseLyrics(lyricsData.syncedLyrics));
          else setLyrics([]);
        }
      } catch (err) { console.error(err); }
    };
    fetchPlayback();
    const interval = setInterval(fetchPlayback, 3000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!isPlaying || lyrics.length === 0) return;
    const sync = () => {
      const elapsed = performance.now() - lastSyncTime.current;
      const exactProgress = (lastSpotifyProgress.current + elapsed) / 1000;
      const index = lyrics.findLastIndex(l => l.time <= exactProgress);
      if (index !== currentLineIndex) setCurrentLineIndex(index);
      animationFrameRef.current = requestAnimationFrame(sync);
    };
    animationFrameRef.current = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [lyrics, currentLineIndex, isPlaying]);

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
    window.location.href = window.location.pathname;
  };

  if (!token) {
    return (
      <div className="login-screen">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="login-card">
          <h1>SpotyReader</h1>
          <p style={{ color: 'var(--text-muted)' }}>Minimalist Music Visualizer</p>
          <button onClick={redirectToLogin} className="login-button">CONECTAR SPOTIFY</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`app-container ${settings.cotodamaMode ? 'cotodama' : ''}`}>
      {track && <div className="background-canvas" style={{ backgroundImage: `url(${track.album.images[0]?.url})` }} />}
      
      <div className={`header-nav ${!uiVisible && !showSettings ? 'hidden' : ''}`}>
        <button onClick={() => setShowSettings(!showSettings)} className="nav-icon-btn">
          {showSettings ? <X size={18} /> : <Sliders size={18} />}
        </button>
        <button onClick={handleLogout} className="nav-icon-btn"><LogOut size={18} /></button>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="settings-panel">
            <h3>Ajustes</h3>
            <div className="settings-group toggle-group">
              <label>Modo Cotodama</label>
              <input type="checkbox" checked={settings.cotodamaMode} onChange={(e) => setSettings({...settings, cotodamaMode: e.target.checked})} />
            </div>
            <div className="settings-group toggle-group">
              <label>Flujo Suave</label>
              <input type="checkbox" checked={settings.smoothTransitions} onChange={(e) => setSettings({...settings, smoothTransitions: e.target.checked})} />
            </div>
            <div className="settings-group">
              <label>Letra Activa</label>
              <input type="range" min="1" max="10" step="0.1" value={settings.activeSize} onChange={(e) => setSettings({...settings, activeSize: parseFloat(e.target.value)})} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {settings.cotodamaMode ? (
        <CotodamaView lyrics={lyrics} currentLineIndex={currentLineIndex} settings={settings} />
      ) : (
        <StandardView track={track} lyrics={lyrics} currentLineIndex={currentLineIndex} settings={settings} />
      )}
    </div>
  );
}

export default App;
