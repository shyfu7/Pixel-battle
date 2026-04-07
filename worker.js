export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.PIXEL_BATTLE) {
      return new Response("Durable Object binding PIXEL_BATTLE is not configured", { status: 500 });
    }

    const id = env.PIXEL_BATTLE.idFromName("main");
    const stub = env.PIXEL_BATTLE.get(id);

    if (url.pathname === "/") {
      return new Response(getHtml(), {
        headers: { "content-type": "text/html; charset=UTF-8" },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

export class PixelBattleRoom {
  constructor(state) {
    this.state = state;
    this.width = 64;
    this.height = 64;
    this.palette = [
      "#ffffff",
      "#000000",
      "#ff3b30",
      "#ff9500",
      "#ffcc00",
      "#34c759",
      "#00c7be",
      "#007aff",
      "#5856d6",
      "#ff2d55",
    ];
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return this.json({}, 204);
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const data = await this.getState();
      return this.json(data);
    }

    if (url.pathname === "/api/place" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.nick !== "string" || !Array.isArray(body.pixels)) {
        return this.json({ error: "Неверный запрос" }, 400);
      }

      const nick = body.nick.trim().slice(0, 20);
      if (!nick) {
        return this.json({ error: "Введите ник" }, 400);
      }

      const pixels = body.pixels.slice(0, 3);
      if (pixels.length === 0) {
        return this.json({ error: "Выберите хотя бы 1 пиксель" }, 400);
      }

      const now = Date.now();
      const cooldownKey = `cooldown:${nick.toLowerCase()}`;
      const lastPlaced = (await this.state.storage.get(cooldownKey)) || 0;
      const cooldownMs = 20_000;
      const leftMs = lastPlaced + cooldownMs - now;

      if (leftMs > 0) {
        return this.json({
          error: `Подожди ${Math.ceil(leftMs / 1000)} сек.`,
          cooldownLeftMs: leftMs,
        }, 429);
      }

      const state = await this.getState();
      const board = state.board;
      const owners = state.owners;

      for (const pixel of pixels) {
        const x = Number(pixel.x);
        const y = Number(pixel.y);
        const color = String(pixel.color || "");

        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
          return this.json({ error: "Координаты вне поля" }, 400);
        }

        if (!this.palette.includes(color)) {
          return this.json({ error: "Недопустимый цвет" }, 400);
        }
      }

      for (const pixel of pixels) {
        board[pixel.y][pixel.x] = pixel.color;
        owners[pixel.y][pixel.x] = nick;
      }

      await this.state.storage.put("board", board);
      await this.state.storage.put("owners", owners);
      await this.state.storage.put(cooldownKey, now);

      return this.json({
        ok: true,
        board,
        cooldownLeftMs: cooldownMs,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async getState() {
    let board = await this.state.storage.get("board");
    let owners = await this.state.storage.get("owners");
    if (!board) {
      board = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => "#ffffff"));
      await this.state.storage.put("board", board);
    }
    if (!owners) {
      owners = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => null));
      await this.state.storage.put("owners", owners);
    }
    return {
      width: this.width,
      height: this.height,
      palette: this.palette,
      board,
      owners,
      maxPixelsPerTurn: 3,
      cooldownSec: 20,
    };
  }

  json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }
}

function getHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pixel Battle</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --panel: #171a21;
      --panel-2: #1f2430;
      --text: #f3f5f8;
      --muted: #9aa4b2;
      --accent: #4f8cff;
      --danger: #ff5d73;
      --ok: #38d39f;
      --cell-size: 10px;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
    }

    .app {
      display: grid;
      grid-template-columns: 1fr 240px;
      min-height: 100vh;
    }

    .main {
      padding: 16px;
      overflow: auto;
    }

    .sidebar {
      border-left: 1px solid rgba(255,255,255,0.08);
      background: var(--panel);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card {
      background: var(--panel-2);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 14px;
    }

    h1, h2, p { margin: 0; }
    h1 { font-size: 24px; }
    h2 { font-size: 16px; margin-bottom: 12px; }
    .sub { color: var(--muted); margin-top: 8px; }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .board-wrap {
      background: #0b0d11;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 12px;
      width: fit-content;
      max-width: 100%;
      overflow: auto;
    }

    canvas {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      display: block;
      background: white;
      border-radius: 10px;
      cursor: crosshair;
    }

    .palette {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }

    .swatch {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 12px;
      border: 3px solid transparent;
      cursor: pointer;
      transition: transform .12s ease, border-color .12s ease;
    }

    .swatch.active {
      border-color: #fff;
      transform: scale(1.05);
    }

    .selected-list {
      display: grid;
      gap: 8px;
      margin-top: 10px;
      max-height: 160px;
      overflow: auto;
    }

    .pixel-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(255,255,255,0.04);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 13px;
    }

    button, input {
      font: inherit;
    }

    .btn {
      border: 0;
      border-radius: 12px;
      padding: 12px 14px;
      background: var(--accent);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    .btn.secondary {
      background: #30384a;
    }

    .btn:disabled {
      cursor: not-allowed;
      opacity: .65;
    }

    .stack { display: grid; gap: 10px; }
    .row { display: flex; gap: 10px; }

    input {
      width: 100%;
      border: 1px solid rgba(255,255,255,0.1);
      background: #10141c;
      color: white;
      border-radius: 12px;
      padding: 12px 14px;
      outline: none;
    }

    .hint, .status {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.4;
    }
    .hover-info {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(255,255,255,0.04);
      font-size: 14px;
      color: var(--text);
    }

    .status.error { color: var(--danger); }
    .status.ok { color: var(--ok); }
    .nick {
      font-weight: 700;
      color: #fff;
    }

    .mobile-palette {
      display: none;
      position: sticky;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
      background: rgba(15,17,21,.96);
      backdrop-filter: blur(10px);
      border-top: 1px solid rgba(255,255,255,0.08);
      padding: 12px;
    }

    @media (max-width: 900px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { display: none; }
      .mobile-palette { display: block; }
      .palette { grid-template-columns: repeat(10, 1fr); }
    }
  </style>
</head>
<body>
  <div class="app">
    <main class="main">
      <div class="topbar">
        <div>
          <h1>Pixel Battle</h1>
          <p class="sub">Выбирай цвет, поставь до 3 пикселей и жди 20 секунд.</p>
        </div>
        <div class="card">
          <div class="hint">Ник</div>
          <div class="nick" id="nickView">—</div>
        </div>
      </div>

      <div class="board-wrap">
        <canvas id="board"></canvas>
      </div>
      <div class="hover-info" id="hoverInfo">Наведи на пиксель, чтобы увидеть автора.</div>
    </main>

    <aside class="sidebar">
      <section class="card stack">
        <h2>Палитра</h2>
        <div class="palette" id="palette"></div>
      </section>

      <section class="card stack">
        <h2>Выбрано: <span id="selectedCount">0</span>/3</h2>
        <div class="selected-list" id="selectedList"></div>
        <div class="row">
          <button class="btn" id="sendBtn">Поставить</button>
          <button class="btn secondary" id="clearBtn">Сброс</button>
        </div>
      </section>

      <section class="card stack">
        <h2>Статус</h2>
        <div class="status" id="status">Загрузка...</div>
        <div class="hint" id="cooldownText">КД: 0 сек</div>
      </section>

      <section class="card stack">
        <h2>Сменить ник</h2>
        <input id="nickInput" maxlength="20" placeholder="Введите ник" />
        <button class="btn secondary" id="saveNickBtn">Сохранить ник</button>
      </section>
    </aside>
  </div>

  <div class="mobile-palette">
    <div class="palette" id="paletteMobile"></div>
  </div>

  <script>
    const STORAGE_KEY = "pixel-battle-nick";
    const canvas = document.getElementById("board");
    const ctx = canvas.getContext("2d");
    const paletteEl = document.getElementById("palette");
    const paletteMobileEl = document.getElementById("paletteMobile");
    const selectedListEl = document.getElementById("selectedList");
    const selectedCountEl = document.getElementById("selectedCount");
    const sendBtn = document.getElementById("sendBtn");
    const clearBtn = document.getElementById("clearBtn");
    const statusEl = document.getElementById("status");
    const cooldownTextEl = document.getElementById("cooldownText");
    const nickViewEl = document.getElementById("nickView");
    const nickInputEl = document.getElementById("nickInput");
    const saveNickBtn = document.getElementById("saveNickBtn");
    const hoverInfoEl = document.getElementById("hoverInfo");

    let state = null;
    let cellSize = 10;
    let selectedColor = "#000000";
    let selectedPixels = [];
    let cooldownUntil = 0;
    let lastBoardHash = "";

    function askNickIfNeeded() {
      let nick = localStorage.getItem(STORAGE_KEY);
      if (!nick) {
        nick = prompt("Введите ваш ник (он запомнится в браузере):", "") || "";
        nick = nick.trim().slice(0, 20);
        if (nick) {
          localStorage.setItem(STORAGE_KEY, nick);
        }
      }
      nickInputEl.value = nick || "";
      nickViewEl.textContent = nick || "Не задан";
    }

    function getNick() {
      return (localStorage.getItem(STORAGE_KEY) || "").trim().slice(0, 20);
    }

    function saveNick() {
      const nick = nickInputEl.value.trim().slice(0, 20);
      if (!nick) {
        setStatus("Введите ник", true);
        return;
      }
      localStorage.setItem(STORAGE_KEY, nick);
      nickViewEl.textContent = nick;
      setStatus("Ник сохранён", false, true);
    }

    function setStatus(text, isError = false, isOk = false) {
      statusEl.textContent = text;
      statusEl.className = "status" + (isError ? " error" : isOk ? " ok" : "");
    }

    function renderPalette() {
      paletteEl.innerHTML = "";
      paletteMobileEl.innerHTML = "";
      state.palette.forEach((color) => {
        const makeSwatch = () => {
          const btn = document.createElement("button");
          btn.className = "swatch" + (selectedColor === color ? " active" : "");
          btn.style.background = color;
          btn.title = color;
          btn.addEventListener("click", () => {
            selectedColor = color;
            renderPalette();
          });
          return btn;
        };
        paletteEl.appendChild(makeSwatch());
        paletteMobileEl.appendChild(makeSwatch());
      });
    }

    function updateCanvasSize() {
      const maxWidth = Math.min(window.innerWidth - 56, 900);
      cellSize = Math.max(6, Math.floor(maxWidth / state.width));
      canvas.width = state.width * cellSize;
      canvas.height = state.height * cellSize;
      drawBoard();
    }

    function drawBoard() {
      if (!state) return;
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          ctx.fillStyle = state.board[y][x];
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }

      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= state.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellSize + 0.5, 0);
        ctx.lineTo(x * cellSize + 0.5, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= state.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellSize + 0.5);
        ctx.lineTo(canvas.width, y * cellSize + 0.5);
        ctx.stroke();
      }

      for (const pixel of selectedPixels) {
        ctx.strokeStyle = "#ff2d55";
        ctx.lineWidth = 2;
        ctx.strokeRect(pixel.x * cellSize + 1, pixel.y * cellSize + 1, cellSize - 2, cellSize - 2);
      }
    }

    function renderSelected() {
      selectedCountEl.textContent = String(selectedPixels.length);
      selectedListEl.innerHTML = "";
      if (selectedPixels.length === 0) {
        const div = document.createElement("div");
        div.className = "hint";
        div.textContent = "Кликни по полю, чтобы выбрать до 3 пикселей.";
        selectedListEl.appendChild(div);
        drawBoard();
        return;
      }

      selectedPixels.forEach((pixel, index) => {
        const row = document.createElement("div");
        row.className = "pixel-item";
        row.innerHTML = '<span>(' + pixel.x + ', ' + pixel.y + ') ' + pixel.color + '</span>';
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn secondary";
        removeBtn.textContent = "X";
        removeBtn.style.padding = "6px 10px";
        removeBtn.addEventListener("click", () => {
          selectedPixels.splice(index, 1);
          renderSelected();
        });
        row.appendChild(removeBtn);
        selectedListEl.appendChild(row);
      });
      drawBoard();
    }

    function hashBoard(board) {
      return JSON.stringify(board);
    }

    async function loadState(showStatus = true) {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = await res.json();
      const newHash = hashBoard(data.board);
      state = data;
      if (newHash !== lastBoardHash) {
        lastBoardHash = newHash;
        updateCanvasSize();
      }
      renderPalette();
      renderSelected();
      if (showStatus) setStatus("Готово");
    }

    function getCanvasCoords(event) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - rect.left) / cellSize);
      const y = Math.floor((event.clientY - rect.top) / cellSize);
      return { x, y };
    }

    function updateHoverInfo(x, y) {
      if (!state || x < 0 || y < 0 || x >= state.width || y >= state.height) {
        hoverInfoEl.textContent = "Наведи на пиксель, чтобы увидеть автора.";
        return;
      }
      const color = state.board[y][x];
      const owner = state.owners?.[y]?.[x];
      if (!owner || color === "#ffffff") {
        hoverInfoEl.textContent = `(${x}, ${y}) — пусто`;
        return;
      }
      hoverInfoEl.textContent = `(${x}, ${y}) — поставил: ${owner}`;
    }

    function addSelectedPixel(x, y) {
      const existingIndex = selectedPixels.findIndex((p) => p.x === x && p.y === y);
      if (existingIndex >= 0) {
        selectedPixels[existingIndex].color = selectedColor;
        renderSelected();
        return;
      }

      if (selectedPixels.length >= 3) {
        setStatus("Можно выбрать максимум 3 пикселя", true);
        return;
      }

      selectedPixels.push({ x, y, color: selectedColor });
      renderSelected();
    }

    async function sendPixels() {
      const nick = getNick();
      if (!nick) {
        setStatus("Сначала задай ник", true);
        return;
      }
      if (Date.now() < cooldownUntil) {
        setStatus("КД ещё не закончился", true);
        return;
      }
      if (selectedPixels.length === 0) {
        setStatus("Нет выбранных пикселей", true);
        return;
      }

      sendBtn.disabled = true;
      try {
        const res = await fetch("/api/place", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nick, pixels: selectedPixels }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.cooldownLeftMs) {
            cooldownUntil = Date.now() + data.cooldownLeftMs;
          }
          setStatus(data.error || "Ошибка", true);
          return;
        }

        state.board = data.board;
        lastBoardHash = hashBoard(data.board);
        cooldownUntil = Date.now() + (data.cooldownLeftMs || 20000);
        selectedPixels = [];
        renderSelected();
        drawBoard();
        setStatus("Пиксели поставлены", false, true);
      } catch (e) {
        setStatus("Ошибка сети", true);
      } finally {
        sendBtn.disabled = false;
      }
    }

    function updateCooldown() {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      cooldownTextEl.textContent = "КД: " + left + " сек";
      sendBtn.disabled = left > 0;
    }

    canvas.addEventListener("mousemove", (event) => {
      if (!state) return;
      const { x, y } = getCanvasCoords(event);
      updateHoverInfo(x, y);
    });

    canvas.addEventListener("mouseleave", () => {
      updateHoverInfo(-1, -1);
    });

    canvas.addEventListener("click", (event) => {
      if (!state) return;
      const { x, y } = getCanvasCoords(event);
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
      addSelectedPixel(x, y);
    });

    sendBtn.addEventListener("click", sendPixels);
    clearBtn.addEventListener("click", () => {
      selectedPixels = [];
      renderSelected();
      setStatus("Выбор очищен");
    });
    saveNickBtn.addEventListener("click", saveNick);
    window.addEventListener("resize", () => state && updateCanvasSize());

    setInterval(updateCooldown, 250);
    setInterval(() => loadState(false).catch(() => {}), 3000);

    (async function init() {
      askNickIfNeeded();
      try {
        await loadState();
      } catch (e) {
        setStatus("Не удалось загрузить поле", true);
      }
      updateCooldown();
    })();
  </script>
</body>
</html>`;
}
