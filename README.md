# STREET BRAWL

Game fighting 2D bergaya Street Fighter (mobile-first) dengan karakter custom dari sprite sheet 4×4 dan fitur **Online Mabar** (WebRTC P2P Room Code).

## Fitur Utama
- **2 Karakter Custom Playable:** **Nadia** (Sarjana Fighter) & **Rendy** (Sandal Jepit Striker) dengan 16 pose animasi lengkap.
- **Mekanik Fighting 2D:** Jab, Heavy Hook, Low Kick, High Kick, Special (Fireball / Uppercut / Dash Kick), Block, Combo Counter, Super Bar & Ultimate Blast, Best of 3 Rounds.
- **Mobile-First Controls:** Multi-touch virtual arcade stick + 6 tombol aksi responsif (plus support keyboard desktop & Local 2P).
- **Online Mabar:** Buat Room Code 4 huruf / salin link invite untuk bertarung langsung P2P via WebRTC.
- **+ Tambah Karakter (Auto Chroma-Key):** Upload sprite sheet 4×4 background `#FF00FF` dari ChatGPT Plus / Gemini langsung di browser — lihat [SPRITE_GUIDE.md](SPRITE_GUIDE.md).

## Jalankan Lokal & Test
```bash
npm test                 # jalankan unit test engine
python3 -m http.server 8080  # buka http://localhost:8080/
```
