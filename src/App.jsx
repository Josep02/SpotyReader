import React, { useState, useEffect, useRef } from 'react';
import { Music, Music2, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getToken, redirectToLogin, refreshAccessToken } from './lib/spotify';
import { fetchLyrics, parseLyrics } from './lib/lyrics';

const DEFAULT_SETTINGS = {
  activeSize: 3.5,
  inactiveSize: 1.8,
  albumSize: 400,
  titleSize: 2,
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('spotify_access_token'));
  const [track, setTrack] = useState(null);
  const [lyrics, setLyrics] = useState([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Customization Settings
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('spoty_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const scrollRef = useRef(null);
  const lastTrackId = useRef(null);

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
          window.history.replaceState({}, document.title, '/');
        }
      }).finally(() => setIsLoading(false));
    }
  }, []);

  // Playback Polling
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
              return;
            }
          }
          handleLogout();
          return;
        }

        if (res.status === 204 || !res.ok) {
          if (track) setTrack(null);
          return;
        }

        const data = await res.json();
        const newTrack = data.item;
        if (!newTrack || !data.is_playing) return;

        setTrack(newTrack);

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
          } else {
            const plain = lyricsData?.plainLyrics?.split('\n').map((text, i) => ({ time: i * 5, text })) || [];
            setLyrics(plain);
          }
        }

        if (data.progress_ms !== undefined && lyrics.length > 0) {
          const progressSec = data.progress_ms / 1000;
          const activeIndex = lyrics.findLastIndex(l => l.time <= progressSec + 0.3);
          if (activeIndex !== currentLineIndex) {
            setCurrentLineIndex(activeIndex);
          }
        }
      } catch (err) {
        console.error('Playback error:', err);
      }
    };

    fetchPlayback();
    const interval = setInterval(fetchPlayback, 1000);
    return () => clearInterval(interval);
  }, [token, track, lyrics, currentLineIndex]);

  // Auto-scroll logic
  useEffect(() => {
    if (scrollRef.current && currentLineIndex >= 0) {
      const el = scrollRef.current.children[currentLineIndex];
      if (el) {
        const containerH = scrollRef.current.parentElement.clientHeight;
        const offset = el.offsetTop - containerH / 2 + el.clientHeight / 2;
        scrollRef.current.style.transform = `translateY(${-offset}px)`;
      }
    }
  }, [currentLineIndex, settings]);

  const handleLogout = () => {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    setToken(null);
    setTrack(null);
    setLyrics([]);
  };

  const updateSetting = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  if (isLoading) return <div className="app-container"><div className="login-screen"><p>Iniciando sesión...</p></div></div>;

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
    <div className="app-container">
      {track && <div className="background-canvas" style={{ backgroundImage: `url(${track.album.images[0]?.url})` }} />}
      
      {/* HUD Buttons */}
      <button onClick={handleLogout} className="logout-btn">Salir</button>
      <button onClick={() => setShowSettings(!showSettings)} className="edit-btn">
        {showSettings ? <X size={16} /> : 'Editar'}
      </button>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="settings-panel"
          >
            <h3>Personalizar</h3>
            
            <div className="settings-group">
              <label>Letra Activa ({settings.activeSize}rem)</label>
              <input type="range" min="1" max="6" step="0.1" value={settings.activeSize} onChange={(e) => updateSetting('activeSize', parseFloat(e.target.value))} />
            </div>

            <div className="settings-group">
              <label>Letra Inactiva ({settings.inactiveSize}rem)</label>
              <input type="range" min="0.5" max="3" step="0.1" value={settings.inactiveSize} onChange={(e) => updateSetting('inactiveSize', parseFloat(e.target.value))} />
            </div>

            <div className="settings-group">
              <label>Título Música ({settings.titleSize}rem)</label>
              <input type="range" min="1" max="4" step="0.1" value={settings.titleSize} onChange={(e) => updateSetting('titleSize', parseFloat(e.target.value))} />
            </div>

            <div className="settings-group">
              <label>Tamaño Portada ({settings.albumSize}px)</label>
              <input type="range" min="100" max="600" step="10" value={settings.albumSize} onChange={(e) => updateSetting('albumSize', parseInt(e.target.value))} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="status-pill">
        {track ? `Reproduciendo: ${track.name}` : 'Abre Spotify'}
      </div>

      <div className="player-layout">
        <div className="track-info">
          {track && (
            <motion.div key={track.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="track-card">
              <img src={track.album.images[0]?.url} className="album-art" style={{ maxWidth: `${settings.albumSize}px` }} />
              <div style={{ marginTop: '1.5rem' }}>
                <h2 style={{ fontSize: `${settings.titleSize}rem` }}>{track.name}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{track.artists.map(a => a.name).join(', ')}</p>
              </div>
            </motion.div>
          )}
        </div>

        <div className="lyrics-container">
          <div className="lyrics-scroll" ref={scrollRef}>
            {lyrics.map((line, index) => (
              <motion.div
                key={index}
                className={`lyric-line ${index === currentLineIndex ? 'active' : ''}`}
                style={{ 
                  fontSize: index === currentLineIndex ? `${settings.activeSize}rem` : `${settings.inactiveSize}rem`
                }}
                animate={{
                  opacity: index === currentLineIndex ? 1 : 0.2,
                  x: index === currentLineIndex ? 12 : 0,
                }}
              >
                {line.text}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
