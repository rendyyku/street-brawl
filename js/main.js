import { FighterAI } from './ai.js';
import { ArcadeAudio } from './audio.js';
import { MAX_SUPER, STAGES, TICK_RATE } from './constants.js';
import { createEmptyInput, FightingEngine } from './engine.js';
import { InputManager } from './input.js';
import { OnlineMabar } from './netcode.js';
import { GameRenderer } from './renderer.js';
import { getFullRoster, resolveFighterStats, saveCustomFighter } from './roster.js';
import { loadImageFromFile, removeMagentaChromaKey } from './sprite-importer.js';

const $ = (id) => document.getElementById(id);

const state = {
  mode: 'cpu', // 'cpu' | 'local' | 'online'
  difficulty: 'normal',
  stageId: STAGES[0].id,
  roster: [],
  p1Fighter: null,
  p2Fighter: null,
  activeSelectSlot: 0,
  engine: null,
  ai: new FighterAI('normal'),
  audio: new ArcadeAudio(),
  input: new InputManager(),
  renderer: null,
  online: null,
  rafId: null,
  lastTs: 0,
  acc: 0,
  resultShown: false,
  importerData: null,
  importerPreviewRaf: null,
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id)?.classList.add('active');
}

function refreshRoster() {
  state.roster = getFullRoster();
  if (!state.p1Fighter) state.p1Fighter = state.roster[0];
  if (!state.p2Fighter) state.p2Fighter = state.roster[1] || state.roster[0];
  renderRosterGrid();
  updateSelectPreview();
}

function renderStageChips() {
  const wrap = $('stage-chips');
  wrap.innerHTML = '';
  for (const st of STAGES) {
    const btn = document.createElement('button');
    btn.className = `chip ${st.id === state.stageId ? 'active' : ''}`;
    btn.textContent = st.name.split(' ')[0] + ' ' + st.name.split(' ')[1];
    btn.addEventListener('click', () => {
      state.audio.playClick();
      state.stageId = st.id;
      renderStageChips();
      if (state.mode === 'online' && state.online?.connected) {
        const myF = state.online.role === 'host' ? state.p1Fighter : state.p2Fighter;
        state.online.sendFighterSelect(myF, state.stageId);
      }
    });
    wrap.appendChild(btn);
  }
}

function renderRosterGrid() {
  const grid = $('roster-grid');
  grid.innerHTML = '';
  for (const f of state.roster) {
    const tile = document.createElement('div');
    tile.className = 'fighter-tile';
    if (state.p1Fighter?.id === f.id) tile.classList.add('selected-p1');
    if (state.p2Fighter?.id === f.id) tile.classList.add('selected-p2');
    tile.innerHTML = `
      <img src="${f.portrait}" alt="${f.name}" />
      <div class="ft-name">${f.name}</div>
      <div class="ft-title">${f.title || f.archetype}</div>
    `;
    tile.addEventListener('click', () => {
      state.audio.playClick();
      if (state.mode === 'online' && state.online?.connected) {
        if (state.online.role === 'host') state.p1Fighter = f;
        else state.p2Fighter = f;
        state.online.sendFighterSelect(f, state.stageId);
      } else if (state.activeSelectSlot === 0) {
        state.p1Fighter = f;
      } else {
        state.p2Fighter = f;
      }
      renderRosterGrid();
      updateSelectPreview();
    });
    grid.appendChild(tile);
  }
}

function updateSelectPreview() {
  const p1 = state.p1Fighter;
  const p2 = state.p2Fighter;
  if (p1) {
    $('p1-select-img').src = p1.portrait;
    $('p1-select-name').textContent = p1.name;
    $('p1-select-move').textContent = p1.specialName || 'SPECIAL';
  }
  if (p2) {
    $('p2-select-img').src = p2.portrait;
    $('p2-select-name').textContent = p2.name;
    $('p2-select-move').textContent = p2.specialName || 'SPECIAL';
  }
}

function openSelectScreen(mode) {
  state.mode = mode;
  state.activeSelectSlot = 0;
  $('cpu-diff-group').classList.toggle('hidden', mode !== 'cpu');
  $('select-target-tabs').classList.toggle('hidden', mode === 'online');
  $('p2-slot-tag').textContent = mode === 'cpu' ? 'CPU' : 'P2';
  $('select-title').textContent =
    mode === 'online'
      ? `ONLINE (${state.online?.role === 'host' ? 'HOST P1' : 'GUEST P2'})`
      : mode === 'local'
      ? 'LOCAL 2P SELECT'
      : 'PILIH KARAKTER';

  const startBtn = $('btn-start-fight');
  if (mode === 'online' && state.online?.role === 'guest') {
    startBtn.textContent = 'MENUNGGU HOST MULAI...';
    startBtn.disabled = true;
  } else {
    startBtn.textContent = 'FIGHT!';
    startBtn.disabled = false;
  }

  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.slot) === 0);
  });
  refreshRoster();
  renderStageChips();
  showScreen('screen-select');
}

function startBattle(p1Config, p2Config, stageId) {
  stopBattleLoop();
  state.p1Fighter = resolveFighterStats(p1Config);
  state.p2Fighter = resolveFighterStats(p2Config);
  state.stageId = stageId || STAGES[0].id;
  state.resultShown = false;

  if (!state.renderer) {
    state.renderer = new GameRenderer($('game-canvas'));
  }
  state.renderer.setStage(state.stageId);
  state.renderer.preloadFighter(state.p1Fighter);
  state.renderer.preloadFighter(state.p2Fighter);

  state.engine = new FightingEngine(state.p1Fighter, state.p2Fighter);
  state.ai.setDifficulty(state.difficulty);
  state.input.setSinglePlayerMode(state.mode !== 'local');
  state.input.clearAll();

  // HUD setup
  $('hud-p1-portrait').src = state.p1Fighter.portrait;
  $('hud-p1-name').textContent = state.p1Fighter.name;
  $('hud-p2-portrait').src = state.p2Fighter.portrait;
  $('hud-p2-name').textContent = state.p2Fighter.name;
  $('hud-ping').classList.toggle('hidden', state.mode !== 'online');
  $('battle-result').classList.add('hidden');

  showScreen('screen-battle');
  state.audio.unlock();
  state.audio.playFight();
  state.audio.startBgm();

  state.lastTs = performance.now();
  state.acc = 0;
  state.rafId = requestAnimationFrame(gameLoop);
}

function stopBattleLoop() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  state.audio.stopBgm();
}

function handleAudioAndFx(events) {
  if (!events || !events.length) return;
  state.renderer.handleEvents(events, [state.p1Fighter, state.p2Fighter]);
  for (const ev of events) {
    if (ev.type === 'hit') state.audio.playHit(ev.heavy);
    else if (ev.type === 'block') state.audio.playBlock();
    else if (ev.type === 'attack_whiff') state.audio.playWhiff();
    else if (ev.type === 'projectile_spawn') state.audio.playFireball();
    else if (ev.type === 'uppercut') state.audio.playUppercut();
    else if (ev.type === 'super_activate') state.audio.playSuper(ev.ultimateTheme);
    else if (ev.type === 'fight_start') state.audio.playFight();
    else if (ev.type === 'ko') state.audio.playKO();
  }
}

function syncHud() {
  const eng = state.engine;
  if (!eng) return;

  const [p1, p2] = eng.fighters;
  const p1Pct = Math.max(0, (p1.hp / p1.maxHp) * 100);
  const p2Pct = Math.max(0, (p2.hp / p2.maxHp) * 100);
  const p1Trail = Math.max(0, (p1.trailHp / p1.maxHp) * 100);
  const p2Trail = Math.max(0, (p2.trailHp / p2.maxHp) * 100);

  const p1Bar = $('hud-p1-hp');
  const p2Bar = $('hud-p2-hp');
  p1Bar.style.width = `${p1Pct}%`;
  p2Bar.style.width = `${p2Pct}%`;
  p1Bar.classList.toggle('danger', p1Pct < 25);
  p2Bar.classList.toggle('danger', p2Pct < 25);
  $('hud-p1-trail').style.width = `${p1Trail}%`;
  $('hud-p2-trail').style.width = `${p2Trail}%`;

  const p1Sup = Math.min(100, (p1.superMeter / MAX_SUPER) * 100);
  const p2Sup = Math.min(100, (p2.superMeter / MAX_SUPER) * 100);
  $('hud-p1-super').style.width = `${p1Sup}%`;
  $('hud-p2-super').style.width = `${p2Sup}%`;
  $('hud-p1-super').classList.toggle('ready', p1.superMeter >= MAX_SUPER);
  $('hud-p2-super').classList.toggle('ready', p2.superMeter >= MAX_SUPER);
  $('hud-p1-super-label').textContent = p1.superMeter >= MAX_SUPER ? 'MAX SUPER!' : 'SUPER';
  $('hud-p2-super-label').textContent = p2.superMeter >= MAX_SUPER ? 'MAX SUPER!' : 'SUPER';

  // Touch Super button glow for local player
  const localSlot = state.mode === 'online' && state.online?.role === 'guest' ? 1 : 0;
  $('btn-touch-super')?.classList.toggle('ready', eng.fighters[localSlot].superMeter >= MAX_SUPER);

  // Round win orbs
  const p1Orbs = $('hud-p1-orbs').children;
  const p2Orbs = $('hud-p2-orbs').children;
  for (let i = 0; i < 2; i++) {
    p1Orbs[i].classList.toggle('won', p1.roundsWon > i);
    p2Orbs[i].classList.toggle('won', p2.roundsWon > i);
  }

  $('hud-timer').textContent = String(eng.getTimeSeconds()).padStart(2, '0');

  if (eng.phase === 'match_over' && !state.resultShown) {
    state.resultShown = true;
    if (eng.winnerSlot === -1) {
      $('result-winner-img').src = state.p1Fighter.portrait;
      $('result-winner-name').textContent = 'DRAW MATCH!';
    } else {
      const winF = eng.winnerSlot === 1 ? state.p2Fighter : state.p1Fighter;
      $('result-winner-img').src = winF.portrait;
      $('result-winner-name').textContent = `${winF.name} WINS!`;
    }
    $('battle-result').classList.remove('hidden');
  }
}

function gameLoop(ts) {
  const dt = Math.min(60, ts - state.lastTs);
  state.lastTs = ts;
  state.acc += dt;
  const stepMs = 1000 / TICK_RATE;

  while (state.acc >= stepMs) {
    state.acc -= stepMs;
    const eng = state.engine;
    if (!eng) break;

    if (state.mode === 'online' && state.online?.connected) {
      if (state.online.role === 'host') {
        const p1In = state.input.getP1Input();
        const p2In = state.online.remoteInput || createEmptyInput();
        eng.step(p1In, p2In);
        const events = eng.consumeEvents();
        handleAudioAndFx(events);
        if (eng.frame % 2 === 0 || events.length > 0) {
          state.online.sendState(eng.getSnapshot(), events);
        }
      } else {
        // Guest sends its own local input as P2
        const myIn = state.input.getP1Input();
        state.online.sendInput(myIn);
      }
    } else {
      const p1In = state.input.getP1Input();
      const p2In =
        state.mode === 'cpu'
          ? state.ai.computeInput(eng, 1)
          : state.input.getP2Input();
      eng.step(p1In, p2In);
      handleAudioAndFx(eng.consumeEvents());
    }
  }

  if (state.engine && state.renderer) {
    state.renderer.render(state.engine, [state.p1Fighter, state.p2Fighter]);
    syncHud();
  }

  state.rafId = requestAnimationFrame(gameLoop);
}

// ONLINE MABAR SETUP
function initOnlineMabar() {
  state.online = new OnlineMabar({
    onStatus: (msg) => {
      $('online-status').textContent = msg;
    },
    onError: (msg) => {
      $('online-status').textContent = `Error: ${msg}`;
    },
    onConnected: (role) => {
      // Ensure local selection is always from this device's own roster, never a previous opponent's fighter
      refreshRoster();
      state.p1Fighter = state.roster[0];
      state.p2Fighter = state.roster[1] || state.roster[0];
      openSelectScreen('online');
      const myF = role === 'host' ? state.p1Fighter : state.p2Fighter;
      state.online.sendFighterSelect(myF, state.stageId);
    },
    onRemoteSelect: (fighter, stageId) => {
      if (!fighter) return;
      if (state.online.role === 'host') {
        state.p2Fighter = resolveFighterStats(fighter);
      } else {
        state.p1Fighter = resolveFighterStats(fighter);
        if (stageId) state.stageId = stageId;
        renderStageChips();
      }
      updateSelectPreview();
      renderRosterGrid();
    },
    onStartMatch: (p1F, p2F, stageId) => {
      startBattle(p1F, p2F, stageId);
    },
    onStateSync: (snap, events) => {
      if (!state.engine) return;
      state.engine.applySnapshot(snap);
      handleAudioAndFx(events);
    },
    onPing: (ms) => {
      $('hud-ping').textContent = `${ms}ms`;
    },
    onRematch: () => {
      startBattle(state.p1Fighter, state.p2Fighter, state.stageId);
    },
    onDisconnected: () => {
      stopBattleLoop();
      state.online?.destroy();
      alert('Lawan terputus dari room.');
      showScreen('screen-title');
    },
  });
}

// SPRITE SHEET IMPORTER MODAL
function openImporter() {
  state.importerData = null;
  $('input-sprite-file').value = '';
  $('imp-name').value = '';
  $('imp-special').value = '';
  $('importer-status').textContent = '';
  $('btn-save-custom').disabled = true;
  const ctx = $('importer-preview-canvas').getContext('2d');
  ctx.clearRect(0, 0, 180, 180);
  $('modal-importer').classList.remove('hidden');
}

function closeImporter() {
  $('modal-importer').classList.add('hidden');
  if (state.importerPreviewRaf) {
    cancelAnimationFrame(state.importerPreviewRaf);
    state.importerPreviewRaf = null;
  }
}

function startImporterPreview(sheetUrl) {
  if (state.importerPreviewRaf) cancelAnimationFrame(state.importerPreviewRaf);
  const img = new Image();
  img.src = sheetUrl;
  const canvas = $('importer-preview-canvas');
  const ctx = canvas.getContext('2d');
  const demoCells = [0, 1, 2, 3, 8, 9, 11, 12, 13, 15];
  let idx = 0;
  let last = 0;

  const tick = (ts) => {
    if (ts - last > 240 && img.complete && img.naturalWidth > 0) {
      last = ts;
      const cell = demoCells[idx % demoCells.length];
      idx += 1;
      const col = cell % 4;
      const row = Math.floor(cell / 4);
      const cw = img.naturalWidth / 4;
      const ch = img.naturalHeight / 4;
      ctx.clearRect(0, 0, 180, 180);
      ctx.drawImage(img, col * cw, row * ch, cw, ch, 6, 6, 168, 168);
    }
    state.importerPreviewRaf = requestAnimationFrame(tick);
  };
  state.importerPreviewRaf = requestAnimationFrame(tick);
}

function wireEvents() {
  state.input.bindMobileControls($('dpad-zone'), $('dpad-knob'), $('action-pad'));

  $('btn-mode-cpu').addEventListener('click', () => {
    state.audio.playClick();
    openSelectScreen('cpu');
  });
  $('btn-mode-local').addEventListener('click', () => {
    state.audio.playClick();
    openSelectScreen('local');
  });
  $('btn-mode-online').addEventListener('click', () => {
    state.audio.playClick();
    $('host-room-info').classList.add('hidden');
    $('online-status').textContent = 'Pilih Buat Room atau masukkan kode dari temanmu.';
    showScreen('screen-online');
  });

  $('btn-open-importer').addEventListener('click', () => {
    state.audio.playClick();
    openImporter();
  });
  $('btn-select-add').addEventListener('click', () => {
    state.audio.playClick();
    openImporter();
  });
  $('btn-close-importer').addEventListener('click', closeImporter);

  $('input-sprite-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    $('importer-status').textContent = 'Menghapus background magenta (#FF00FF)...';
    try {
      const img = await loadImageFromFile(file);
      const res = removeMagentaChromaKey(img, 768);
      state.importerData = res;
      startImporterPreview(res.sheetDataUrl);
      $('btn-save-custom').disabled = false;
      $('importer-status').textContent = 'Mantap! Background otomatis bersih. Isi nama lalu Simpan.';
    } catch {
      $('importer-status').textContent = 'Gagal membaca gambar. Coba file PNG/JPG lain.';
    }
  });

  $('btn-save-custom').addEventListener('click', () => {
    if (!state.importerData) return;
    const rawName = $('imp-name').value.trim().toUpperCase() || 'CUSTOM';
    const specialName = $('imp-special').value.trim().toUpperCase() || 'ENERGY WAVE';
    const energy = $('imp-energy').value || '#38bdf8';
    const fighter = saveCustomFighter({
      id: `custom_${Date.now()}`,
      name: rawName,
      title: 'Custom Fighter',
      archetype: $('imp-archetype').value,
      specialName,
      superName: `${rawName} ULTIMATE`,
      spriteSheet: state.importerData.sheetDataUrl,
      portrait: state.importerData.portraitDataUrl,
      colors: {
        primary: energy,
        accent: '#facc15',
        energy,
        energyCore: '#ffffff',
      },
    });
    state.p1Fighter = resolveFighterStats(fighter);
    refreshRoster();
    closeImporter();
    state.audio.playClick();
  });

  // Online Lobby actions
  $('btn-online-back').addEventListener('click', () => {
    state.online?.destroy();
    showScreen('screen-title');
  });

  $('btn-create-room').addEventListener('click', async () => {
    state.audio.playClick();
    try {
      const code = await state.online.createRoom();
      $('display-room-code').textContent = code;
      $('host-room-info').classList.remove('hidden');
    } catch {}
  });

  $('btn-copy-link').addEventListener('click', async () => {
    const code = state.online?.roomCode;
    if (!code) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      $('online-status').textContent = 'Link invite tersalin! Kirim ke temanmu di WhatsApp.';
    } catch {
      $('online-status').textContent = `Bagikan kode room: ${code}`;
    }
  });

  $('btn-join-room').addEventListener('click', async () => {
    state.audio.playClick();
    const code = $('input-room-code').value;
    try {
      await state.online.joinRoom(code);
    } catch (err) {
      $('online-status').textContent = err.message || 'Gagal gabung room.';
    }
  });

  // Select Screen actions
  $('btn-select-back').addEventListener('click', () => {
    if (state.mode === 'online') state.online?.destroy();
    showScreen('screen-title');
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeSelectSlot = Number(btn.dataset.slot);
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#diff-chips .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.difficulty = btn.dataset.diff;
      document.querySelectorAll('#diff-chips .chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  $('btn-start-fight').addEventListener('click', () => {
    state.audio.playClick();
    if (state.mode === 'online' && state.online?.connected && state.online.role === 'host') {
      state.online.sendStartMatch(state.p1Fighter, state.p2Fighter, state.stageId);
    }
    startBattle(state.p1Fighter, state.p2Fighter, state.stageId);
  });

  // Battle Screen controls
  $('btn-mute').addEventListener('click', () => {
    const muted = state.audio.toggleMute();
    $('btn-mute').textContent = muted ? 'OFF' : 'SFX';
  });

  $('btn-exit-battle').addEventListener('click', () => {
    stopBattleLoop();
    if (state.mode === 'online') state.online?.destroy();
    showScreen('screen-title');
  });

  $('btn-rematch').addEventListener('click', () => {
    state.audio.playClick();
    if (state.mode === 'online' && state.online?.connected) {
      state.online.sendRematch();
    }
    startBattle(state.p1Fighter, state.p2Fighter, state.stageId);
  });

  $('btn-back-select').addEventListener('click', () => {
    stopBattleLoop();
    openSelectScreen(state.mode);
  });
}

function checkInviteLink() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    $('input-room-code').value = room.toUpperCase().slice(0, 4);
    showScreen('screen-online');
    $('online-status').textContent = `Kode room ${room.toUpperCase()} terdeteksi — klik GABUNG untuk mabar!`;
  }
}

initOnlineMabar();
refreshRoster();
wireEvents();
checkInviteLink();
