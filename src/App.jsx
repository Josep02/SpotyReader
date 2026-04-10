import React, { useState, useEffect, useRef } from 'react';
import { Music, Music2, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getToken, redirectToLogin, refreshAccessToken } from './lib/spotify';
import { fetchLyrics, parseLyrics } from './lib/lyrics';

const DEFAULT_SETTINGS = {
  activeSize: 4.5,
  inactiveSize: 1.8,
  albumSize: 400,
  titleSize: 2.2,
  smoothTransitions: true,
  cotodamaMode: false,
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('spotify_access_token'));
  const [track, setTrack] = useState(null);
  const [lyrics, setLyrics] = useState([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Settings with localStorage
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('spoty_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const scrollRef = useRef(null);
  const lastTrackId = useRef(null);
  
  // High-precision sync refs
  const lastSyncTime = useRef(0);
  const lastSpotifyProgress = useRef(0);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('spoty_settings', JSON.stringify(settings));
  }, [settings]);

  // Auth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !token) {
      setIsLoading(true);
      getToken(code).then(data => {
        if (data.access_token) {
          localStorage.setItem('spotify_access_token', data.access_token);
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
          setToken(data.access_token);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }).finally(() => setIsLoading(false));
    }
  }, [token]);

  // Primary Polling (Track Info)
  useEffect(() => {
    if (!token) return;

    const fetchPlayback = async () => {
      try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          const refresh = localStorage.getItem('spotify_refresh_token');
          if (refresh) {
            const data = await refreshAccessToken(refresh);
            if (data.access_token) {
              setToken(data.access_token);
              localStorage.setItem('spotify_access_token', data.access_token);
            }
          }
          return;
        }

        if (res.status === 204) {
          setTrack(null);
          return;
        }

        const data = await res.json();
        const newTrack = data.item;
        
        if (!newTrack) return;

        setTrack(newTrack);
        setIsPlaying(data.is_playing);

        // Update high-precision sync baseline
        lastSpotifyProgress.current = data.progress_ms;
        lastSyncTime.current = performance.now();

        if (newTrack.id !== lastTrackId.current) {
          lastTrackId.current = newTrack.id;
          setLyrics([]);
          const lyricsData = await fetchLyrics(
            newTrack.name,
            newTrack.artists[0].name,
            newTrack.album.name,
            Math.floor(newTrack.duration_ms / 1000)
          );
          
          if (lyricsData?.syncedLyrics) {
            setLyrics(parseLyrics(lyricsData.syncedLyrics));
          } else if (lyricsData?.plainLyrics) {
            const lines = lyricsData.plainLyrics.split('\n').map((text, i) => ({ time: i * 5, text }));
            setLyrics(lines);
          } else {
            setLyrics([]);
          }
        }
      } catch (err) {
        console.error('Playback Error:', err);
      }
    };

    fetchPlayback();
    const interval = setInterval(fetchPlayback, 3000); // Poll track less often
    return () => clearInterval(interval);
  }, [token]);

  // High Precision Sychronizer
  useEffect(() => {
    if (!isPlaying || lyrics.length === 0) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const syncLyrics = () => {
      const currentTime = performance.now();
      const elapsed = currentTime - lastSyncTime.current;
      const exactProgress = (lastSpotifyProgress.current + elapsed) / 1000;

      const activeIndex = lyrics.findLastIndex(l => l.time <= exactProgress);
      if (activeIndex !== currentLineIndex) {
        setCurrentLineIndex(activeIndex);
      }
      animationFrameRef.current = requestAnimationFrame(syncLyrics);
    };

    animationFrameRef.current = requestAnimationFrame(syncLyrics);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [lyrics, currentLineIndex, isPlaying]);

  // Visual Scrolling Logic
  useEffect(() => {
    if (scrollRef.current && currentLineIndex >= 0) {
      const el = scrollRef.current.children[currentLineIndex];
      if (el) {
        const containerH = scrollRef.current.parentElement.clientHeight;
        const offset = el.offsetTop - containerH / 2 + el.clientHeight / 2;
        
        scrollRef.current.style.transition = settings.smoothTransitions 
          ? 'transform 1s cubic-bezier(0.16, 1, 0.3, 1)' 
          : 'none';
        scrollRef.current.style.transform = `translateY(${-offset}px)`;
      }
    }
  }, [currentLineIndex, settings]);

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
    setTrack(null);
    setLyrics([]);
    window.location.href = window.location.pathname;
  };

  const updateSetting = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  if (isLoading) return <div className="app-container"><div className="login-screen"><p>Entrando en el flujo musical...</p></div></div>;

  if (!token) {
    return (
      <div className="app-container">
        <div className="login-screen">
          <Music2 size={64} color="#1ed760" />
          <h1>SpotyReader</h1>
          <p>La experiencia visual de tus letras.</p>
          <button onClick={redirectToLogin} className="login-button">Conectar con Spotify</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${settings.cotodamaMode ? 'cotodama' : ''}`}>
      {track && (
        <div 
          className="background-canvas" 
          style={{ 
            backgroundImage: `url(${track.album.images[0]?.url})`,
            filter: settings.cotodamaMode ? 'grayscale(100%) blur(120px) brightness(0.2)' : 'blur(60px) brightness(0.5)'
          }} 
        />
      )}
      
      <button onClick={handleLogout} className="logout-btn">Salir</button>
      <button onClick={() => setShowSettings(!showSettings)} className="edit-btn">
        {showSettings ? <X size={16} /> : <Settings size={16} />}
      </button>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="settings-panel">
            <h3>Ajustes Visuales</h3>
            <div className="settings-group toggle-group">
              <label>Modo Cotodama</label>
              <input type="checkbox" checked={settings.cotodamaMode} onChange={(e) => updateSetting('cotodamaMode', e.target.checked)} />
            </div>
            <div className="settings-group toggle-group">
              <label>Animación Fluida</label>
              <input type="checkbox" checked={settings.smoothTransitions} onChange={(e) => updateSetting('smoothTransitions', e.target.checked)} />
            </div>
            <div className="settings-group">
              <label>Tamaño Texto Activo</label>
              <input type="range" min="1" max="10" step="0.1" value={settings.activeSize} onChange={(e) => updateSetting('activeSize', parseFloat(e.target.value))} />
            </div>
            <div className="settings-group">
              <label>Tamaño Texto Fondo</label>
              <input type="range" min="0.5" max="5" step="0.1" value={settings.inactiveSize} onChange={(e) => updateSetting('inactiveSize', parseFloat(e.target.value))} />
            </div>
            {!settings.cotodamaMode && (
              <div className="settings-group">
                <label>Tamaño Portada</label>
                <input type="range" min="100" max="800" step="10" value={settings.albumSize} onChange={(e) => updateSetting('albumSize', parseInt(e.target.value))} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="player-layout">
        {!settings.cotodamaMode && (
          <div className="track-info">
            {track ? (
              <motion.div key={track.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="track-card">
                <img src={track.album.images[0]?.url} className="album-art" style={{ maxWidth: `${settings.albumSize}px` }} />
                <div style={{ marginTop: '2rem' }}>
                  <h2 style={{ fontSize: `${settings.titleSize}rem` }}>{track.name}</h2>
                  <p style={{ color: 'var(--text-muted)' }}>{track.artists.map(a => a.name).join(', ')}</p>
                </div>
              </motion.div>
            ) : (
              <div className="no-track-info"><Music size={80} opacity={0.3} /><p>Escucha en Spotify para empezar</p></div>
            )}
          </div>
        )}

        <div className="lyrics-container">
          <div className="lyrics-scroll" ref={scrollRef}>
            {lyrics.length > 0 ? (
              lyrics.map((line, index) => {
                const isActive = index === currentLineIndex;
                const isPast = index < currentLineIndex;
                const isFuture = index > currentLineIndex;

                return (
                  <motion.div
                    key={index}
                    className={`lyric-line ${isActive ? 'active' : ''}`}
                    style={{ 
                      fontSize: isActive ? `${settings.activeSize}rem` : `${settings.inactiveSize}rem`,
                      textAlign: settings.cotodamaMode ? 'center' : 'left',
                      color: isActive ? '#fff' : (settings.cotodamaMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)')
                    }}
                    animate={{
                      opacity: isActive ? 1 : (settings.cotodamaMode ? (isPast || isFuture ? 0.05 : 0.1) : 0.3),
                      scale: isActive ? 1.05 : 0.95,
                      filter: isActive ? 'blur(0px)' : (settings.cotodamaMode ? 'blur(4px)' : 'blur(0px)'),
                      y: isActive ? 0 : (isPast ? -10 : 10),
                    }}
                    transition={{
                      duration: settings.smoothTransitions ? 0.8 : 0.2,
                      ease: [0.16, 1, 0.3, 1]
                    }}
                  >
                    {line.text}
                  </motion.div>
                );
              })
            ) : (
              <div className="lyric-line active" style={{ textAlign: 'center' }}>
                {track ? 'Buscando letras...' : 'Esperando música...'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
