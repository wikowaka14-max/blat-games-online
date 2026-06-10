import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const ADMIN_CODE = window.ADMIN_CODE || "183729";
const OWNER_NICK = normalizeNick(window.OWNER_NICK || "veyr1x");
const START_COINS = Number(window.START_COINS || 5000);

let app = null;
let db = null;
let onlineMode = false;
let currentNick = localStorage.getItem("bg_current_nick") || "";
let deviceId = localStorage.getItem("bg_device_id") || crypto.randomUUID();
let currentGame = "checkers";
let selectedCell = null;
let bj = null;

localStorage.setItem("bg_device_id", deviceId);

const badConfig = !window.FIREBASE_CONFIG
  || !window.FIREBASE_CONFIG.apiKey
  || String(window.FIREBASE_CONFIG.apiKey).includes("ВСТАВЬ");

if (!badConfig) {
  try {
    app = initializeApp(window.FIREBASE_CONFIG);
    db = getDatabase(app);
    onlineMode = true;
    document.getElementById("modeText").textContent = "✅ Онлайн-режим: общий баланс через Firebase";
  } catch (err) {
    onlineMode = false;
    document.getElementById("modeText").textContent = "⚠️ Firebase не запустился. Работает локальное демо.";
    console.error(err);
  }
} else {
  document.getElementById("modeText").textContent = "⚠️ Локальное демо: вставь Firebase config для общего онлайна.";
}

const glow = document.getElementById("glow");
window.addEventListener("mousemove", (e) => {
  glow.style.left = e.clientX + "px";
  glow.style.top = e.clientY + "px";
});

window.scrollToBlock = (id) => document.getElementById(id).scrollIntoView({ behavior: "smooth" });

function normalizeNick(nick) {
  return String(nick || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9_]/gi, "")
    .slice(0, 18);
}

function localPlayers() {
  return JSON.parse(localStorage.getItem("bg_players") || "{}");
}

function saveLocalPlayers(players) {
  localStorage.setItem("bg_players", JSON.stringify(players));
}

function localAdmins() {
  const a = JSON.parse(localStorage.getItem("bg_admins") || "{}");
  if (!a[OWNER_NICK]) a[OWNER_NICK] = { nick: OWNER_NICK, role: "owner", addedBy: "system" };
  localStorage.setItem("bg_admins", JSON.stringify(a));
  return a;
}

function saveLocalAdmins(admins) {
  localStorage.setItem("bg_admins", JSON.stringify(admins));
}

async function getUser(nick) {
  if (onlineMode) {
    const snap = await get(ref(db, `users/${nick}`));
    return snap.exists() ? snap.val() : null;
  }
  return localPlayers()[nick] || null;
}

async function setUser(nick, data) {
  if (onlineMode) return set(ref(db, `users/${nick}`), data);
  const players = localPlayers();
  players[nick] = data;
  saveLocalPlayers(players);
}

async function patchUser(nick, data) {
  if (onlineMode) return update(ref(db, `users/${nick}`), data);
  const players = localPlayers();
  players[nick] = { ...(players[nick] || {}), ...data };
  saveLocalPlayers(players);
}

async function getAdmin(nick) {
  if (onlineMode) {
    const snap = await get(ref(db, `admins/${nick}`));
    return snap.exists() ? snap.val() : null;
  }
  return localAdmins()[nick] || null;
}

async function setAdmin(nick, role, addedBy) {
  const data = { nick, role, addedBy, addedAt: Date.now() };
  if (onlineMode) return set(ref(db, `admins/${nick}`), data);
  const admins = localAdmins();
  admins[nick] = data;
  saveLocalAdmins(admins);
}

async function removeAdminNick(nick) {
  if (onlineMode) return remove(ref(db, `admins/${nick}`));
  const admins = localAdmins();
  delete admins[nick];
  saveLocalAdmins(admins);
}

async function ensureOwner() {
  const ownerAdmin = await getAdmin(OWNER_NICK);
  if (!ownerAdmin) await setAdmin(OWNER_NICK, "owner", "system");

  const ownerUser = await getUser(OWNER_NICK);
  if (!ownerUser) {
    await setUser(OWNER_NICK, {
      nick: OWNER_NICK,
      coins: START_COINS,
      ownerId: "owner-reserved",
      createdAt: Date.now()
    });
  }
}

async function login() {
  const input = document.getElementById("nickInput");
  const nick = normalizeNick(input.value);

  if (!nick) {
    alert("Введи нормальный ник");
    return;
  }

  const existing = await getUser(nick);

  if (existing && existing.ownerId && existing.ownerId !== deviceId && nick !== OWNER_NICK) {
    alert("Этот ник уже занят. Выбери другой.");
    return;
  }

  if (!existing) {
    await setUser(nick, {
      nick,
      coins: START_COINS,
      ownerId: deviceId,
      createdAt: Date.now()
    });
  } else if (!existing.ownerId && nick !== OWNER_NICK) {
    await patchUser(nick, { ownerId: deviceId });
  }

  if (nick === OWNER_NICK) {
    await setAdmin(OWNER_NICK, "owner", "system");
  }

  currentNick = nick;
  localStorage.setItem("bg_current_nick", nick);
  await renderProfile();
  renderGame();
}

async function renderProfile() {
  const nickEl = document.getElementById("profileNick");
  const coinsEl = document.getElementById("profileCoins");
  const roleEl = document.getElementById("profileRole");

  if (!currentNick) {
    nickEl.textContent = "не выбран";
    coinsEl.textContent = "0";
    roleEl.textContent = "игрок";
    return;
  }

  const u = await getUser(currentNick);
  const a = await getAdmin(currentNick);

  nickEl.textContent = currentNick;
  coinsEl.textContent = u ? u.coins : "0";
  roleEl.textContent = a ? (a.role === "owner" ? "главный админ" : "админ") : "игрок";
}

function listenTables() {
  if (onlineMode) {
    onValue(ref(db, "users"), async (snap) => {
      const users = snap.exists() ? snap.val() : {};
      const adminsSnap = await get(ref(db, "admins"));
      const admins = adminsSnap.exists() ? adminsSnap.val() : {};
      renderPlayersTable(users, admins);
      renderProfile();
    });

    onValue(ref(db, "admins"), async () => {
      const usersSnap = await get(ref(db, "users"));
      const adminsSnap = await get(ref(db, "admins"));
      renderPlayersTable(usersSnap.exists() ? usersSnap.val() : {}, adminsSnap.exists() ? adminsSnap.val() : {});
      renderProfile();
    });
  } else {
    renderPlayersTable(localPlayers(), localAdmins());
  }
}

function renderPlayersTable(users, admins) {
  const body = document.getElementById("playersTable");
  const rows = Object.values(users || {}).sort((a, b) => Number(b.coins || 0) - Number(a.coins || 0));

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4">Пока пусто. Войди по нику.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((u, i) => {
    const a = admins && admins[u.nick];
    const role = a ? (a.role === "owner" ? "главный админ" : "админ") : "игрок";
    return `<tr><td>${i + 1}</td><td>${u.nick}</td><td>${Number(u.coins || 0)} БК</td><td>${role}</td></tr>`;
  }).join("");
}

async function runAdminCommand() {
  const code = document.getElementById("adminCode").value;
  const cmd = document.getElementById("adminCommand").value.trim();
  const log = document.getElementById("adminLog");

  if (!currentNick) {
    log.textContent = "❌ Сначала войди по нику.";
    return;
  }

  if (code !== ADMIN_CODE) {
    log.textContent = "❌ Неверный админ-код.";
    return;
  }

  const currentAdmin = await getAdmin(currentNick);
  if (!currentAdmin) {
    log.textContent = "❌ Ты не админ.";
    return;
  }

  const parts = cmd.split(/\s+/);
  const command = parts[0];

  if (command === "/pay") {
    if (parts.length !== 3) {
      log.textContent = "❌ Формат: /pay nick 500";
      return;
    }

    const nick = normalizeNick(parts[1]);
    const amount = Number(parts[2]);

    if (!nick || !Number.isFinite(amount) || amount === 0) {
      log.textContent = "❌ Пример: /pay dimas 500";
      return;
    }

    const u = await getUser(nick);
    if (!u) {
      log.textContent = "❌ Игрок не найден. Он должен сначала войти на сайт.";
      return;
    }

    const newCoins = Math.max(0, Number(u.coins || 0) + amount);
    await patchUser(nick, { coins: newCoins, updatedAt: Date.now() });

    log.textContent = `✅ ${nick} ${amount > 0 ? "+" : ""}${amount} БК\nБаланс: ${newCoins} БК`;
    if (!onlineMode) listenTables();
    return;
  }

  if (command === "/addadmin") {
    if (currentNick !== OWNER_NICK) {
      log.textContent = "❌ Только главный админ veyr1x может добавлять админов.";
      return;
    }

    if (parts.length !== 2) {
      log.textContent = "❌ Формат: /addadmin nick";
      return;
    }

    const nick = normalizeNick(parts[1]);
    const u = await getUser(nick);
    if (!u) {
      log.textContent = "❌ Игрок не найден. Он должен сначала войти на сайт.";
      return;
    }

    await setAdmin(nick, "admin", currentNick);
    log.textContent = `✅ ${nick} теперь админ.`;
    if (!onlineMode) listenTables();
    return;
  }

  if (command === "/deladmin") {
    if (currentNick !== OWNER_NICK) {
      log.textContent = "❌ Только главный админ veyr1x может удалять админов.";
      return;
    }

    if (parts.length !== 2) {
      log.textContent = "❌ Формат: /deladmin nick";
      return;
    }

    const nick = normalizeNick(parts[1]);
    if (nick === OWNER_NICK) {
      log.textContent = "❌ Нельзя удалить главного админа.";
      return;
    }

    await removeAdminNick(nick);
    log.textContent = `✅ ${nick} больше не админ.`;
    if (!onlineMode) listenTables();
    return;
  }

  log.textContent = "❌ Команды: /pay nick сумма, /addadmin nick, /deladmin nick";
}

function openGame(game) {
  currentGame = game;
  selectedCell = null;
  const titles = {
    checkers: "Шашки",
    chess: "Шахматы",
    durak: "Дурак",
    blackjack: "Blackjack"
  };
  document.getElementById("gameTitle").textContent = titles[game] || "Игра";
  renderGame();
}

function resetGame() {
  selectedCell = null;
  bj = null;
  renderGame();
}

function renderGame() {
  if (currentGame === "checkers") return renderCheckers();
  if (currentGame === "chess") return renderChess();
  if (currentGame === "durak") return renderDurak();
  return renderBlackjack();
}

function renderCheckers() {
  const root = document.getElementById("gameRender");
  root.innerHTML = `<div class="board" id="board"></div>`;
  const board = document.getElementById("board");

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const dark = (r + c) % 2 === 1;
      const cell = document.createElement("div");
      cell.className = "cell " + (dark ? "dark" : "light");

      if (dark && r < 3) cell.innerHTML = `<div class="piece blackPiece"></div>`;
      if (dark && r > 4) cell.innerHTML = `<div class="piece"></div>`;

      cell.onclick = () => movePiece(cell, dark);
      board.appendChild(cell);
    }
  }
}

function movePiece(cell, allowed) {
  if (cell.querySelector(".piece") || cell.textContent.trim()) {
    if (selectedCell) selectedCell.style.outline = "";
    selectedCell = cell;
    cell.style.outline = "3px solid var(--yellow)";
  } else if (selectedCell && allowed) {
    cell.innerHTML = selectedCell.innerHTML;
    cell.textContent = selectedCell.textContent;
    selectedCell.innerHTML = "";
    selectedCell.textContent = "";
    selectedCell.style.outline = "";
    selectedCell = null;
  }
}

function renderChess() {
  const root = document.getElementById("gameRender");
  root.innerHTML = `<div class="board" id="board"></div>`;
  const board = document.getElementById("board");
  const white = ["♖","♘","♗","♕","♔","♗","♘","♖"];
  const black = ["♜","♞","♝","♛","♚","♝","♞","♜"];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement("div");
      cell.className = "cell " + ((r + c) % 2 ? "dark" : "light");

      if (r === 0) cell.textContent = black[c];
      if (r === 1) cell.textContent = "♟";
      if (r === 6) cell.textContent = "♙";
      if (r === 7) cell.textContent = white[c];

      cell.onclick = () => movePiece(cell, true);
      board.appendChild(cell);
    }
  }
}

function renderDurak() {
  const deck = ["6♠","7♥","8♣","9♦","10♠","J♥","Q♣","K♦","A♠","6♥","7♣","8♦","9♠","10♥","J♣","Q♦","K♠","A♥"];
  const hand = deck.sort(() => Math.random() - 0.5).slice(0, 6);

  document.getElementById("gameRender").innerHTML = `
    <div>
      <h3 style="text-align:center;margin-bottom:18px">Твоя рука</h3>
      <div class="hand">${hand.map(c => `<div class="card2">${c}</div>`).join("")}</div>
      <p style="text-align:center;color:var(--muted);margin-top:18px">Демо без ставок: обнови игру для новой руки.</p>
    </div>
  `;
}

function cardValue(card) {
  const rank = card.replace(/[♠♥♣♦]/g, "");
  if (["J", "Q", "K"].includes(rank)) return 10;
  if (rank === "A") return 11;
  return Number(rank);
}

function score(hand) {
  let sum = hand.reduce((a, c) => a + cardValue(c), 0);
  let aces = hand.filter(c => c.startsWith("A")).length;
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return sum;
}

function drawCard() {
  const ranks = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const suits = ["♠","♥","♣","♦"];
  return ranks[Math.floor(Math.random() * ranks.length)] + suits[Math.floor(Math.random() * suits.length)];
}

function startBj() {
  bj = {
    player: [drawCard(), drawCard()],
    dealer: [drawCard(), drawCard()],
    done: false,
    result: ""
  };
}

function bjHit() {
  if (!bj || bj.done) return;
  bj.player.push(drawCard());
  if (score(bj.player) > 21) {
    bj.done = true;
    bj.result = "Перебор. Дилер победил.";
  }
  renderBlackjack();
}

function bjStand() {
  if (!bj || bj.done) return;
  while (score(bj.dealer) < 17) bj.dealer.push(drawCard());

  const ps = score(bj.player);
  const ds = score(bj.dealer);

  bj.done = true;
  if (ds > 21 || ps > ds) bj.result = "Ты победил.";
  else if (ps === ds) bj.result = "Ничья.";
  else bj.result = "Дилер победил.";

  renderBlackjack();
}

function renderBlackjack() {
  if (!bj) startBj();

  const dealerCards = bj.done ? bj.dealer : [bj.dealer[0], "??"];
  const dealerScore = bj.done ? score(bj.dealer) : "?";

  document.getElementById("gameRender").innerHTML = `
    <div class="blackjack">
      <div>
        <h3>Дилер: ${dealerScore}</h3>
        <div class="bj-row">${dealerCards.map(c => `<div class="card2">${c}</div>`).join("")}</div>
      </div>

      <div>
        <h3>Ты: ${score(bj.player)}</h3>
        <div class="bj-row">${bj.player.map(c => `<div class="card2">${c}</div>`).join("")}</div>
      </div>

      <div class="bj-score">${bj.result || "Ход за тобой"}</div>

      <div class="bj-actions">
        <button class="btn primary" onclick="window.bjHit()">Ещё карту</button>
        <button class="btn ghost" onclick="window.bjStand()">Стоп</button>
        <button class="btn ghost" onclick="window.newBj()">Новая игра</button>
      </div>

      <p style="color:var(--muted)">Без ставок: БлатКоины не списываются и не начисляются автоматически.</p>
    </div>
  `;
}

window.login = login;
window.runAdminCommand = runAdminCommand;
window.openGame = openGame;
window.resetGame = resetGame;
window.bjHit = bjHit;
window.bjStand = bjStand;
window.newBj = () => {
  bj = null;
  renderBlackjack();
};

await ensureOwner();
if (currentNick) await renderProfile();
listenTables();
renderGame();
