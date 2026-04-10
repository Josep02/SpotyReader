import axios from 'axios';

/**
 * Fetches lyrics from LRCLib.net
 * @param {string} trackName 
 * @param {string} artistName 
 * @param {string} albumName 
 * @param {number} durationSeconds 
 */
export const fetchLyrics = async (trackName, artistName, albumName, durationSeconds) => {
  try {
    const response = await axios.get('https://lrclib.net/api/get', {
      params: {
        track_name: trackName,
        artist_name: artistName,
        album_name: albumName,
        duration: durationSeconds,
      }
    });
    
    return response.data;
  } catch (error) {
    // If exact match fails, try searching
    try {
      const searchResponse = await axios.get('https://lrclib.net/api/search', {
        params: { q: `${trackName} ${artistName}` }
      });
      if (searchResponse.data.length > 0) {
        return searchResponse.data[0];
      }
    } catch (e) {
      console.error('Lyrics search failed', e);
    }
    return null;
  }
};

/**
 * Parses LRCLIB synced lyrics into an array of objects
 * @param {string} lrc 
 */
export const parseLyrics = (lrc) => {
  if (!lrc) return [];
  
  const lines = lrc.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  
  lines.forEach(line => {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, '0'));
      const time = minutes * 60 + seconds + ms / 1000;
      const text = line.replace(timeRegex, '').trim();
      if (text) {
        result.push({ time, text });
      }
    }
  });
  
  return result;
};
