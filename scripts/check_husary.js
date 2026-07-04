process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const ids = ['ar.husary', 'ar.husarymujawwad'];
(async () => {
  for (const id of ids) {
    for (const cdn of ['network', 'app']) {
      for (const s of [1, 2, 36, 114]) {
        const u = cdn === 'app'
          ? `https://cdn.islamic.app/quran/audio-surah/${id}/${s}.mp3`
          : `https://cdn.islamic.network/quran/audio-surah/128/${id}/${s}.mp3`;
        const r = await axios.head(u, { timeout: 10000, validateStatus: () => true });
        console.log(id, cdn, 's' + s, r.status);
      }
    }
  }
})();
