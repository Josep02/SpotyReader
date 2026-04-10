import React, { useState, useEffect, useRef } from 'react';
import { Music, Music2, Settings, X, Ghost } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getToken, redirectToLogin, refreshAccessToken } from './lib/spotify';
import { fetchLyrics, parseLyrics } from './lib/lyrics';

const DEFAULT_SETTINGS = {
  activeSize: 3.5,
  inactiveSize: 1.8,
  albumSize: 400,
  titleSize: 2,
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
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('spoty_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const scrollRef = useRef(null);
  const lastTrackId = useRef(null);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('spoty_settings', JSON.stringify(settings));
  }, [settings]);

  // Auth Callback
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

  // Main Polling Loop
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
        
        if (!newTrack) {
          setTrack(null);
          return;
        }

        setTrack(newTrack);
        setIsPlaying(data.is_playing);

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

        if (data.progress_ms !== undefined && lyrics.length > 0) {
          const progressSec = data.progress_ms / 1000;
          const index = lyrics.findLastIndex(l => l.time <= progressSec + 0.3);
          if (index !== currentLineIndex) {
            setCurrentLineIndex(index);
          }
        }
      } catch (err) {
        console.error('Playback Error:', err);
      }
    };

    fetchPlayback();
    const interval = setInterval(fetchPlayback, 1000);
    return () => clearInterval(interval);
  }, [token, lyrics, currentLineIndex]);

  // Scroll logic
  useEffect(() => {
    if (scrollRef.current && currentLineIndex >= 0) {
      const el = scrollRef.current.children[currentLineIndex];
      if (el) {
        const containerH = scrollRef.current.parentElement.clientHeight;
        const offset = el.offsetTop - containerH / 2 + (settings.cotodamaMode ? el.clientHeight / 2 : 0);
        
        // Use auto or smooth behavior based on settings
        scrollRef.current.style.transition = settings.smoothTransitions ? 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
        scrollRef.current.style.transform = `translateY(${-offset}px)`;
      }
    }
  }, [currentLineIndex, settings.smoothTransitions, settings.activeSize, settings.cotodamaMode]);

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

  if (isLoading) return <div className="app-container"><div className="login-screen"><p>Preparando tu experiencia...</p></div></div>;

  if (!token) {
    return (
      <div className="app-container">
        <div className="login-screen">
          <Music2 size={64} color="#1ed760" />
          <h1>SpotyReader</h1>
          <p>Letras dinámicas con diseño premium.</p>
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
            filter: settings.cotodamaMode ? 'grayscale(100%) blur(80px) brightness(0.3)' : 'blur(60px) brightness(0.5)'
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
            <h3>Ajustes</h3>
            
            <div className="settings-group toggle-group">
              <label>Modo Cotodama</label>
              <input type="checkbox" checked={settings.cotodamaMode} onChange={(e) => updateSetting('cotodamaMode', e.target.checked)} />
            </div>

            <div className="settings-group toggle-group">
              <label>Transición Suave</label>
              <input type="checkbox" checked={settings.smoothTransitions} onChange={(e) => updateSetting('smoothTransitions', e.target.checked)} />
            </div>

            <div className="settings-group">
              <label>Letra Activa ({settings.activeSize}rem)</label>
              <input type="range" min="1" max="8" step="0.1" value={settings.activeSize} onChange={(e) => updateSetting('activeSize', parseFloat(e.target.value))} />
            </div>

            <div className="settings-group">
              <label>Letra Inactiva ({settings.inactiveSize}rem)</label>
              <input type="range" min="0.5" max="4" step="0.1" value={settings.inactiveSize} onChange={(e) => updateSetting('inactiveSize', parseFloat(e.target.value))} />
            </div>

            {!settings.cotodamaMode && (
              <>
                <div className="settings-group">
                  <label>Título ({settings.titleSize}rem)</label>
                  <input type="range" min="1" max="4" step="0.1" value={settings.titleSize} onChange={(e) => updateSetting('titleSize', parseFloat(e.target.value))} />
                </div>
                <div className="settings-group">
                  <label>Portada ({settings.albumSize}px)</label>
                  <input type="range" min="100" max="600" step="10" value={settings.albumSize} onChange={(e) => updateSetting('albumSize', parseInt(e.target.value))} />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="player-layout">
        {!settings.cotodamaMode && (
          <div className="track-info">
            {track ? (
              <motion.div key={track.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="track-card">
                <img src={track.album.images[0]?.url} className="album-art" style={{ maxWidth: `${settings.albumSize}px` }} />
                <div style={{ marginTop: '1.5rem' }}>
                  <h2 style={{ fontSize: `${settings.titleSize}rem` }}>{track.name}</h2>
                  <p style={{ color: 'var(--text-muted)' }}>{track.artists.map(a => a.name).join(', ')}</p>
                </div>
              </motion.div>
            ) : (
              <div className="no-track-info"><Music size={80} opacity={0.3} /><p>Escucha algo en Spotify</p></div>
            )}
          </div>
        )}

        <div className="lyrics-container">
          <div className="lyrics-scroll" ref={scrollRef}>
            {lyrics.length > 0 ? (
              lyrics.map((line, index) => (
                <motion.div
                  key={index}
                  className={`lyric-line ${index === currentLineIndex ? 'active' : ''}`}
                  style={{ 
                    fontSize: index === currentLineIndex ? `${settings.activeSize}rem` : `${settings.inactiveSize}rem`,
                    textAlign: settings.cotodamaMode ? 'center' : 'left'
                  }}
                  animate={{
                    opacity: index === currentLineIndex ? 1 : (settings.cotodamaMode ? 0.05 : 0.2),
                    x: index === currentLineIndex ? (settings.cotodamaMode ? 0 : 20) : 0,
                    filter: index === currentLineIndex ? 'blur(0px)' : (settings.cotodamaMode ? 'blur(4px)' : 'blur(0px)'),
                    scale: settings.cotodamaMode && index === currentLineIndex ? 1.05 : 1
                  }}
                  transition={{
                    duration: settings.smoothTransitions ? 0.6 : 0,
                    type: "spring",
                    stiffness: 100,
                    damping: 20
                  }}
                >
                  {line.text}
                </motion.div>
              ))
            ) : (
              <div className="lyric-line active" style={{ textAlign: 'center', opacity: 0.5 }}>
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
