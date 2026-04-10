import React, { useState, useEffect, useRef } from 'react';
import { Music, Music2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getToken, redirectToLogin, refreshAccessToken } from './lib/spotify';
import { fetchLyrics, parseLyrics } from './lib/lyrics';

function App() {
  const [token, setToken] = useState(localStorage.getItem('spotify_access_token'));
  const [track, setTrack] = useState(null);
  const [lyrics, setLyrics] = useState([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);
  const lastTrackId = useRef(null);

  // Handle Auth Callback — works on /callback path
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
        } else {
          console.error('Token error:', data);
        }
      }).finally(() => setIsLoading(false));
    }
  }, []);

  // Playback Polling every second
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

        if (res.status === 204 || !res.ok) {
          setTrack(null);
          return;
        }

        const data = await res.json();
        const newTrack = data.item;
        if (!newTrack) return;

        setTrack(newTrack);

        // Fetch lyrics only when track changes
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
          } else {
            setLyrics([]);
          }
          setCurrentLineIndex(-1);
        }

        // Sync current lyric line
        if (data.progress_ms !== undefined) {
          const progressSec = data.progress_ms / 1000;
          setLyrics(prev => {
            const idx = [...prev].reverse().findIndex(l => l.time <= progressSec + 0.3);
            const activeIndex = idx === -1 ? -1 : prev.length - 1 - idx;
            setCurrentLineIndex(activeIndex);
            return prev;
          });
        }
      } catch (err) {
        console.error('Playback fetch error:', err);
      }
    };

    fetchPlayback();
    const interval = setInterval(fetchPlayback, 1000);
    return () => clearInterval(interval);
  }, [token]);

  // Auto-scroll to active lyric line
  useEffect(() => {
    if (scrollRef.current && currentLineIndex >= 0) {
      const el = scrollRef.current.children[currentLineIndex];
      if (el) {
        const containerH = scrollRef.current.parentElement.clientHeight;
        const offset = el.offsetTop - containerH / 2 + el.clientHeight / 2;
        scrollRef.current.style.transform = `translateY(${-offset}px)`;
      }
    }
  }, [currentLineIndex]);

  const handleLogout = () => {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    setToken(null);
    setTrack(null);
    setLyrics([]);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="app-container">
        <div className="login-screen">
          <Music2 size={64} color="#1ed760" />
          <p>Conectando con Spotify...</p>
        </div>
      </div>
    );
  }

  // Login screen
  if (!token) {
    return (
      <div className="app-container">
        <div className="login-screen">
          <Music2 size={64} color="#1ed760" />
          <h1>SpotyReader</h1>
          <p>Experimenta tus letras favoritas con un diseño premium y sincronizado.</p>
          <button onClick={redirectToLogin} className="login-button">
            Conectar con Spotify
          </button>
        </div>
      </div>
    );
  }

  // Main player
  return (
    <div className="app-container">
      {track && (
        <div
          className="background-canvas"
          style={{ backgroundImage: `url(${track.album.images[0]?.url})` }}
        />
      )}

      <div className="status-pill">
        {track ? `♪ ${track.name} — ${track.artists.map(a => a.name).join(', ')}` : 'Abre Spotify para comenzar'}
      </div>

      <button onClick={handleLogout} className="logout-btn">
        Salir
      </button>

      <div className="player-layout">
        {/* Left: Track Info */}
        <div className="track-info">
          <AnimatePresence mode="wait">
            {track ? (
              <motion.div
                key={track.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5 }}
                className="track-card"
              >
                <img
                  src={track.album.images[0]?.url}
                  alt={track.name}
                  className="album-art"
                />
                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>{track.name}</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '0.4rem' }}>
                    {track.artists.map(a => a.name).join(', ')}
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem', opacity: 0.6 }}>
                    {track.album.name}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="no-track"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ textAlign: 'center', opacity: 0.4 }}
              >
                <Music size={100} />
                <p style={{ marginTop: '1rem' }}>No hay música sonando</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Lyrics */}
        <div className="lyrics-container">
          <div className="lyrics-scroll" ref={scrollRef}>
            {lyrics.length > 0 ? (
              lyrics.map((line, index) => (
                <motion.div
                  key={index}
                  className={`lyric-line ${index === currentLineIndex ? 'active' : ''}`}
                  animate={{
                    opacity: index === currentLineIndex ? 1 : 0.25,
                    x: index === currentLineIndex ? 8 : 0,
                  }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                >
                  {line.text}
                </motion.div>
              ))
            ) : (
              <div className="lyric-line active" style={{ textAlign: 'center', opacity: 0.5 }}>
                {track ? 'No se encontraron letras para esta canción' : 'Esperando música...'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
