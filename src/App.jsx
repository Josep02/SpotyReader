import React, { useState, useEffect, useRef } from 'react';
import { Music, Music2, Settings, X, LogOut } from 'lucide-react';
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
          window.history.replaceState({}, document.title, '/');
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
          setLyrics([]);
          return;
        }

        const data = await res.json();
        const newTrack = data.item;
        
        if (!newTrack) {
          setTrack(null);
          return;
        }

        // Always update basic info
        setTrack(newTrack);
        setIsPlaying(data.is_playing);

        // Fetch lyrics only if track changed
        if (newTrack.id !== lastTrackId.current) {
          lastTrackId.current = newTrack.id;
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

        // Sync progress
        if (data.progress_ms !== undefined) {
          const progressSec = data.progress_ms / 1000;
          // Find the last line that started before current progress
          let activeIdx = -1;
          // We need current lyrics from state, but inside an interval it can be tricky.
          // React updates state, so we use a small trick by finding in the current sync loop
        }
      } catch (err) {
        console.error('Playback Error:', err);
      }
    };

    fetchPlayback();
    const interval = setInterval(fetchPlayback, 1000);
    return () => clearInterval(interval);
  }, [token]); // ONLY depend on token to avoid restarts

  // Progress Sync Effect (Separated for stability)
  useEffect(() => {
    if (!track || lyrics.length === 0) return;
    
    // This runs less frequently or on demand if needed, 
    // but for now, we'll let the main polling set a simple counter or use global sync.
  }, [track, lyrics]);

  // Helper to get active index from lyrics
  const updateActiveIndex = (progressMs) => {
    if (!lyrics.length) return;
    const progressSec = progressMs / 1000;
    const index = lyrics.findLastIndex(l => l.time <= progressSec + 0.3);
    if (index !== currentLineIndex) {
      setCurrentLineIndex(index);
    }
  };

  // Re-fetch progress more accurately
  useEffect(() => {
    if (!token || !isPlaying) return;
    
    // Refined sync timer
    const syncTimer = setInterval(async () => {
       const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { Authorization: `Bearer ${token}` },
       });
       if (res.ok && res.status !== 204) {
         const data = await res.json();
         updateActiveIndex(data.progress_ms);
       }
    }, 1000);

    return () => clearInterval(syncTimer);
  }, [token, isPlaying, lyrics]);

  // Scroll logic
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
    localStorage.clear();
    setToken(null);
    setTrack(null);
    setLyrics([]);
    window.location.href = '/';
  };

  if (isLoading) return <div className="app-container"><div className="login-screen"><p>Sincronizando...</p></div></div>;

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
      
      <button onClick={handleLogout} className="logout-btn">Salir</button>
      <button onClick={() => setShowSettings(!showSettings)} className="edit-btn">
        {showSettings ? <X size={16} /> : 'Editar'}
      </button>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="settings-panel">
            <h3>Personalizar</h3>
            <div className="settings-group">
              <label>Letra Activa ({settings.activeSize}rem)</label>
              <input type="range" min="1" max="6" step="0.1" value={settings.activeSize} onChange={(e) => setSettings({...settings, activeSize: parseFloat(e.target.value)})} />
            </div>
            <div className="settings-group">
              <label>Letra Inactiva ({settings.inactiveSize}rem)</label>
              <input type="range" min="0.5" max="3" step="0.1" value={settings.inactiveSize} onChange={(e) => setSettings({...settings, inactiveSize: parseFloat(e.target.value)})} />
            </div>
            <div className="settings-group">
              <label>Título ({settings.titleSize}rem)</label>
              <input type="range" min="1" max="4" step="0.1" value={settings.titleSize} onChange={(e) => setSettings({...settings, titleSize: parseFloat(e.target.value)})} />
            </div>
            <div className="settings-group">
              <label>Portada ({settings.albumSize}px)</label>
              <input type="range" min="100" max="600" step="10" value={settings.albumSize} onChange={(e) => setSettings({...settings, albumSize: parseInt(e.target.value)})} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="player-layout">
        <div className="track-info">
          {track ? (
            <motion.div key={track.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="track-card">
              <img src={track.album.images[0]?.url} className="album-art" style={{ maxWidth: `${settings.albumSize}px` }} />
              <div style={{ marginTop: '1.5rem' }}>
                <h2 style={{ fontSize: `${settings.titleSize}rem` }}>{track.name}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{track.artists.map(a => a.name).join(', ')}</p>
                {!isPlaying && <p style={{ color: 'var(--primary)', marginTop: '0.5rem', fontSize: '0.8rem' }}>En pausa</p>}
              </div>
            </motion.div>
          ) : (
            <div className="no-track-info"><Music size={100} opacity={0.3} /><p>Abre Spotify y reproduce algo</p></div>
          )}
        </div>

        <div className="lyrics-container">
          <div className="lyrics-scroll" ref={scrollRef}>
            {lyrics.length > 0 ? (
              lyrics.map((line, index) => (
                <motion.div
                  key={index}
                  className={`lyric-line ${index === currentLineIndex ? 'active' : ''}`}
                  style={{ fontSize: index === currentLineIndex ? `${settings.activeSize}rem` : `${settings.inactiveSize}rem` }}
                  animate={{
                    opacity: index === currentLineIndex ? 1 : 0.2,
                    x: index === currentLineIndex ? 10 : 0,
                  }}
                >
                  {line.text}
                </motion.div>
              ))
            ) : (
              <div className="lyric-line active" style={{ textAlign: 'center' }}>
                {track ? 'Letras no disponibles' : 'Esperando música...'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
