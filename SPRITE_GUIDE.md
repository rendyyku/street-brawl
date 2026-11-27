# Street Brawl — Character Animation & Ultimate Sprite Guide (for ChatGPT Plus / Gemini)

Panduan ini dirancang supaya **ChatGPT Plus / Gemini** (atau developer) yang membaca repo `rendyyku/street-brawl` tahu persis format aset untuk:
1. **Base Sprite Sheet 4×4** (karakter baru)
2. **Multi-Frame Horizontal Strips 1×6** (animasi fluid per gerakan)
3. **Cinematic Ultimate Cut-In 16:9** (banner sinematik unik tiap karakter)

---

## 1. Karakter & Tema Ultimate Saat Ini

| Fighter | Referensi Sheet | Tema Ultimate | Nama Ultimate | Folder Aset |
| --- | --- | --- | --- | --- |
| **NADIA** | `assets/fighters/nadia_sheet.webp` | `love` (**Tema Cinta**) | **HEARTSTORM FINALE** | `assets/fighters/nadia_*.webp` |
| **RENDY** | `assets/fighters/rendy_sheet.webp` | `claude_code` (**Tema Claude Code**) | **CLAUDE CODE OVERDRIVE** | `assets/fighters/rendy_*.webp` |

---

## 2. Format Multi-Frame Horizontal Strip (Animasi Fluid)

Untuk membuat gerakan jauh lebih halus setara Street Fighter, buat **strip horizontal 1 baris × 6 kolom** (`1536×256` atau rasio 6:1):
- **Background:** Solid datar **Magenta `#FF00FF`** (tanpa gradasi, tanpa garis grid, tanpa teks, tanpa bayangan lantai).
- **Arah hadap:** Semua 6 frame menghadap ke **KANAN**, tinggi karakter & garis kaki konsisten.
- **Nama file & action key di `js/roster.js` (`animations`):**
  - `idle`: `assets/fighters/<id>_idle.webp` (6 frame breathing + selendang/rambut bergerak)
  - `walk`: `assets/fighters/<id>_walk.webp` (6 frame langkah maju halus)
  - `punch`: `assets/fighters/<id>_punch.webp` (6 frame windup → jab → follow-through)
  - `kick`: `assets/fighters/<id>_kick.webp` (6 frame pivot → high kick → recovery)
  - `special`: `assets/fighters/<id>_special.webp` (6 frame charge → projectile thrust)
  - `ultimate`: `assets/fighters/<id>_ultimate.webp` (6 frame animasi Ultimate bertema karakter)

Setiap action yang **belum** punya file strip akan otomatis fallback ke base sheet 4×4 (`<id>_sheet.webp`), jadi animasi bisa ditambah bertahap satu per satu.

---

## 3. Format Ultimate Cut-In Banner (16:9)

- **File:** `assets/fighters/<id>_cutin.webp` (atau `.png` lalu konversi dengan `tools/process_sprite.py --no-chromakey --width 1024`)
- **Ukuran:** `1024×576` (16:9), **TIDAK** pakai magenta `#FF00FF` — langsung background dramatis anime sesuai tema karakter:
  - **Nadia (`love`):** Close-up anime ekspresi percaya diri & senyum hangat, dikelilingi aura hati pink-emas & kelopak mawar.
  - **Rendy (`claude_code`):** Close-up anime ekspresi fokus/keren dengan pantulan layar terminal gelap, aksen oranye terracotta `#d97757`, dan teks kode `> claude`.

---

## 4. Cara Proses & Daftarkan Aset ke Game

Setelah ChatGPT Plus menghasilkan gambar `.png` (background `#FF00FF`):

```bash
# 1. Strip animasi 1x6 (otomatis hapus magenta #FF00FF -> transparent WebP)
python3 tools/process_sprite.py nadia_ultimate.png assets/fighters/nadia_ultimate.webp

# 2. Banner Ultimate Cut-In 16:9 (tanpa chroma-key)
python3 tools/process_sprite.py nadia_cutin.png assets/fighters/nadia_cutin.webp --no-chromakey --width 1024
```

Lalu daftarkan di `js/roster.js` pada objek fighter terkait:

```js
ultimateCutin: 'assets/fighters/nadia_cutin.webp',
animations: {
  idle: { src: 'assets/fighters/nadia_idle.webp', frames: 6, fps: 10 },
  walk: { src: 'assets/fighters/nadia_walk.webp', frames: 6, fps: 12 },
  punch: { src: 'assets/fighters/nadia_punch.webp', frames: 6, fps: 16 },
  kick: { src: 'assets/fighters/nadia_kick.webp', frames: 6, fps: 16 },
  ultimate: { src: 'assets/fighters/nadia_ultimate.webp', frames: 6, fps: 12 },
},
```

---

## 5. Base Sprite Sheet 4×4 (Untuk Karakter Baru)

- **Background:** `#FF00FF` solid, tanpa garis grid/teks.
- **Grid:** 4 kolom × 4 baris (16 pose menghadap KANAN):
  - Row 1: `Idle 1`, `Idle 2`, `Walk 1`, `Walk 2`
  - Row 2: `Crouch`, `Jump`, `Block`, `Hurt`
  - Row 3: `Light Punch`, `Heavy Punch`, `Low Kick`, `High Kick`
  - Row 4: `Special Charge`, `Special Blast`, `Knockdown / KO`, `Victory`
- Bisa langsung di-upload di menu **+ KARAKTER** di dalam browser (chroma-key otomatis).
