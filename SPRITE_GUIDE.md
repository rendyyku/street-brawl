# Street Brawl — Custom Character Sprite Sheet Guide

Panduan ini dirancang supaya kamu (atau **ChatGPT Plus / Gemini** yang membaca repo ini) bisa membuat karakter fighting baru dari foto orang asli yang **100% langsung cocok** dengan engine Street Brawl.

## Spesifikasi Sprite Sheet (Wajib)

- **Format gambar:** PNG / JPG / WebP (disarankan rasio 1:1, misal `1024×1024`).
- **Background:** Warna solid datar **Magenta `#FF00FF`** (tanpa gradasi, tanpa bayangan lantai, tanpa garis grid, tanpa teks/label). Engine akan otomatis menghapus background magenta ini dengan chroma-key.
- **Grid:** **4 kolom × 4 baris** (total 16 pose full-body), ukuran karakter konsisten di setiap sel, kaki sejajar di garis bawah tiap sel.
- **Arah hadap:** Semua 16 pose **menghadap ke KANAN** (engine otomatis flip ke kiri saat menjadi Player 2).

## Urutan 16 Pose (Kiri ke Kanan, Atas ke Bawah)

| Row | Col 1 | Col 2 | Col 3 | Col 4 |
| --- | --- | --- | --- | --- |
| **Row 1** | 1. Idle Stance 1 | 2. Idle Stance 2 | 3. Walk Forward 1 | 4. Walk Forward 2 |
| **Row 2** | 5. Crouch | 6. Jump | 7. Block / Guard | 8. Hurt / Hitstun |
| **Row 3** | 9. Light Punch (Jab) | 10. Heavy Punch | 11. Low Kick | 12. High Kick |
| **Row 4** | 13. Special Charge | 14. Special Blast (Hadouken) | 15. Knockdown / KO | 16. Victory Pose |

## Prompt Siap Pakai (ChatGPT Plus / Gemini)

Upload foto orang yang ingin dijadikan karakter, lalu tempel prompt berikut (ganti bagian `[DESKRIPSI OUTFIT]`):

```text
Create a 2D fighting game character sprite sheet based on the person in this reference photo, drawn in a clean cute chibi anime/cartoon illustration style with bold black outlines, smooth cel-shading, expressive faces, and consistent proportions.

Character design (keep identical across all 16 sprites):
- Matching the reference photo's likeness
- [DESKRIPSI OUTFIT: misal baju, celana/rok, hijab/rambut, sepatu]

Strict sprite sheet layout rules:
- Solid flat bright magenta background (#FF00FF) ONLY, no gradients, no shadows on background, no grid lines, no text, no labels, no borders
- Exact 4 columns x 4 rows grid (16 full-body sprites total), evenly spaced, same character size in every cell, feet aligned on the same baseline
- ALL 16 poses facing RIGHT (side-view / 3/4 fighting game angle)

Exact 16 poses (left to right, top to bottom):
Row 1:
1. Idle fighting stance (fists raised up in martial arts guard, confident smile)
2. Idle fighting stance frame 2 (slight bounce, ready stance)
3. Walk forward frame 1 (front leg stepping forward)
4. Walk forward frame 2 (back leg passing forward)

Row 2:
5. Crouch (low fighting crouch)
6. Jump (mid-air dynamic jump pose, knees tucked)
7. Block / Guard (arms crossed protecting face, determined expression)
8. Hurt / Hitstun (leaning back from impact, surprised expression)

Row 3:
9. Light Punch (quick forward straight jab with white speed lines)
10. Heavy Punch (strong lunging power punch with bold white motion arc)
11. Low Kick (crouching forward sweep kick)
12. High Kick (dynamic high roundhouse kick forward with white motion lines)

Row 4:
13. Special Charge (hands cupped at waist charging glowing energy, focused eyes)
14. Special Blast / Hadouken (both palms thrust forward firing an energy blast)
15. Knockdown / KO (fallen on the ground dizzy with swirl eyes and yellow stars)
16. Victory Pose (joyful cheering pose with peace sign or fist pump)
```

## Cara Memasukkan ke Game

1. **Langsung di Browser:** Buka menu **+ TAMBAH KARAKTER** di layar pilih karakter -> upload file sprite sheet magenta -> background `#FF00FF` otomatis hilang -> klik **SIMPAN** -> langsung bisa dimainkan (termasuk di Online Mabar!).
2. **Permanen di Repo:** Simpan sprite sheet di `assets/fighters/<nama>_sheet.webp` & `assets/fighters/<nama>_portrait.webp`, lalu daftarkan di `js/roster.js`.
