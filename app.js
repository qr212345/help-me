import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://esddtjbpcisqhfdapgpx.supabase.co";
const SUPABASE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZGR0amJwY2lzcWhmZGFwZ3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MTU1NDEsImV4cCI6MjA2Nzk5MTU0MX0.zrkh64xMd82DmPI7Zffcj4-H328JxBstpbS43pTujaI";

// AcceptヘッダーはSupabase側が自動付与してくれるので、カスタム設定しない
export const supabase = createClient(SUPABASE_URL, SUPABASE_JWT);

const FIXED_ID = "00000000-0000-0000-0000-000000000001";
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbxIn2YX-kvlTyO6RcQvIKTxqG1_FcGv1wEdYD3YIiB9xU7_Ux9aCrBVAcAUR-fqNHY_/exec";

const SCAN_COOLDOWN_MS = 1500;

let seatMap = {};
let playerData = {};
let actionHistory = [];

let qrReaderScan, qrReaderRanking;
let qrActiveScan = false, qrActiveRanking = false;
let lastText = "", lastScan = 0;
let currentSeatId = null;

const $ = id => document.getElementById(id);
const message = txt => {
  const m = $("messageArea");
  if (m) {
    m.textContent = txt;
    setTimeout(() => {
      if (m.textContent === txt) m.textContent = "";
    }, 3000);
  }
};

function onScan(text) {
  const now = Date.now();
  if (text === lastText && now - lastScan < SCAN_COOLDOWN_MS) return;
  lastText = text;
  lastScan = now;

  if (text.startsWith("table")) {
    seatMap[text] ??= [];
    currentSeatId = text;
    message(`✅ 座席セット: ${text}`);
  } else if (text.startsWith("player")) {
    if (!currentSeatId) return message("⚠ 先に座席QRを");
    if (seatMap[currentSeatId].includes(text)) return message("⚠ 既に登録済み");
    seatMap[currentSeatId].push(text);
    playerData[text] ??= { nickname: text, rate: 50, last_rank: null, bonus: 0, title: null };
    actionHistory.push({ type: "add", seat: currentSeatId, pid: text });
    message(`✅ 追加: ${text}`);
  }
  renderSeats();
  saveGame().catch(e => message("保存エラー:" + e.message));
}

export function initCamera() {
  if (qrActiveScan) return;
  qrReaderScan ??= new Html5Qrcode("reader");
  qrReaderScan.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScan)
    .then(() => qrActiveScan = true)
    .catch(() => message("❌ カメラ起動失敗"));
}

function renderSeats() {
  const root = $("seatList");
  if (!root) return;
  root.innerHTML = "";
  Object.keys(seatMap).forEach(seat => {
    const div = document.createElement("div");
    div.className = "seat-block";
    div.innerHTML = `<h3>${seat}<span class="remove-button" onclick="window.removeSeat('${seat}')">✖</span></h3>`;
    seatMap[seat].forEach(pid => {
      const p = playerData[pid] || {};
      div.insertAdjacentHTML("beforeend",
        `<div class="player-entry">
          <span>${pid} (rate:${p.rate}) ${p.title ?? ""}</span>
          <span class="remove-button" onclick="window.removePlayer('${seat}','${pid}')">✖</span>
        </div>`);
    });
    root.appendChild(div);
  });
}

window.removePlayer = (seat, pid) => {
  const i = seatMap[seat].indexOf(pid);
  if (i > -1) {
    seatMap[seat].splice(i, 1);
    actionHistory.push({ type: "delPlayer", seat, pid, idx: i });
    renderSeats();
    saveGame().catch(e => message("保存エラー:" + e.message));
  }
};

window.removeSeat = seat => {
  if (confirm("丸ごと削除？")) {
    actionHistory.push({ type: "delSeat", seat, players: [...seatMap[seat]] });
    delete seatMap[seat];
    renderSeats();
    saveGame().catch(e => message("保存エラー:" + e.message));
  }
};

window.undoAction = () => {
  const act = actionHistory.pop();
  if (!act) return message("履歴なし");
  if (act.type === "add") {
    seatMap[act.seat] = seatMap[act.seat].filter(x => x !== act.pid);
  } else if (act.type === "delPlayer") {
    seatMap[act.seat].splice(act.idx, 0, act.pid);
  } else if (act.type === "delSeat") {
    seatMap[act.seat] = act.players;
  }
  renderSeats();
  saveGame().catch(e => message("保存エラー:" + e.message));
  message("↩ 戻しました");
};

function onRankingScan(text) {
  if (!text.startsWith("table")) {
    message("順位登録は座席コードのみ読み込み");
    return;
  }
  if (!seatMap[text]) {
    message("未登録の座席です");
    return;
  }

  currentSeatId = text;

  const rankingList = $("rankingList");
  rankingList.innerHTML = "";
  seatMap[text].forEach(pid => {
    const li = document.createElement("li");
    li.textContent = pid;
    rankingList.appendChild(li);
  });

  makeListDraggable(rankingList);

  message(`✅ ${text} の順位登録モード`);
}

function initRankingCamera() {
  if (qrActiveRanking) return;
  qrReaderRanking ??= new Html5Qrcode("rankingReader");
  qrReaderRanking.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onRankingScan)
    .then(() => qrActiveRanking = true)
    .catch(() => message("❌ 順位登録カメラ起動失敗"));
}

function makeListDraggable(ul) {
  let dragging = null;
  ul.querySelectorAll("li").forEach(li => {
    li.draggable = true;
    li.ondragstart = () => {
      dragging = li;
      li.classList.add("dragging");
    };
    li.ondragend = () => {
      dragging = null;
      li.classList.remove("dragging");
    };
    li.ondragover = e => {
      e.preventDefault();
      const tgt = e.target;
      if (tgt && tgt !== dragging && tgt.nodeName === "LI") {
        const r = tgt.getBoundingClientRect();
        tgt.parentNode.insertBefore(dragging, (e.clientY - r.top) > r.height / 2 ? tgt.nextSibling : tgt);
      }
    };
  });
}

function getTopRatedPlayerId() {
  let maxRate = -Infinity,
    maxId = null;
  for (const [id, p] of Object.entries(playerData)) {
    if (p.rate > maxRate) {
      maxRate = p.rate;
      maxId = id;
    }
  }
  return maxId;
}

function assignTitles() {
  Object.values(playerData).forEach(p => (p.title = null));
  Object.entries(playerData)
    .sort((a, b) => b[1].rate - a[1].rate)
    .slice(0, 3)
    .forEach(([pid], i) => (playerData[pid].title = ["👑", "🥈", "🥉"][i]));
}

function calculateRate(ranked) {
  ranked.forEach((pid, i) => {
    const p = playerData[pid];
    const prev = p.last_rank ?? ranked.length;
    let diff = prev - (i + 1);
    let pt = diff * 2;
    if (prev === 1 && i === ranked.length - 1) pt = -8;
    if (prev === ranked.length && i === 0) pt = 8;
    if (p.rate >= 80) pt = Math.floor(pt * 0.8);
    const top = getTopRatedPlayerId();
    if (top && p.rate <= playerData[top].rate && i + 1 < (playerData[top].last_rank ?? ranked.length)) pt += 2;
    p.bonus = pt;
    p.rate = Math.max(30, p.rate + pt);
    p.last_rank = i + 1;
  });
  assignTitles();
}

window.confirmRanking = () => {
  const order = [...document.querySelectorAll("#rankingList li")].map(li => li.textContent);
  calculateRate(order);
  renderSeats();
  saveGame().catch(e => message("保存エラー:" + e.message));
  message("✅ 順位確定しました");

  $("rankingSection").style.display = "none";
  $("scanSection").style.display = "block";

  if (qrReaderRanking && qrActiveRanking) {
    qrReaderRanking.stop();
    qrActiveRanking = false;
  }
  initCamera();
};

async function saveGame() {
  const payload = {
    id: FIXED_ID,
    seat_map: seatMap,
    player_data: playerData
  };

  // Supabase保存
  const { error } = await supabase.from("game_data").upsert(payload, { onConflict: "id" });
  if (error) throw error;

  // Google Driveバックアップ保存
  const res = await fetch(GAS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatMap, playerData })
  });
  if (!res.ok) throw new Error("Drive保存エラー");
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message || "Drive保存失敗");
}

async function loadGame() {
  // Supabase読み込み
  const { data, error } = await supabase.from("game_data").select("*").eq("id", FIXED_ID).single();
  if (error) {
    message("Supabase読み込みエラー:" + error.message);
  } else if (data) {
    seatMap = data.seat_map ?? {};
    playerData = data.player_data ?? {};
    renderSeats();
  }

  // Google Driveバックアップ読み込み（Supabase失敗時の保険など）
  try {
    const res = await fetch(GAS_ENDPOINT, { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      seatMap = d.seatMap ?? seatMap;
      playerData = d.playerData ?? playerData;
      renderSeats();
    }
  } catch (e) {
    console.warn("Drive読み込み失敗", e);
  }
}

window.saveToCSV = () => {
  const rows = [["座席ID", "プレイヤーID", "ニックネーム", "レート", "順位", "ボーナス", "称号"]];
  Object.entries(seatMap).forEach(([seat, players]) => {
    players.forEach(pid => {
      const p = playerData[pid] || {};
      rows.push([
        seat,
        pid,
        p.nickname || "",
        p.rate ?? "",
        p.last_rank ?? "",
        p.bonus ?? "",
        p.title ?? ""
      ]);
    });
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "babanuki_data.csv";
  a.click();
  URL.revokeObjectURL(url);
};

window.saveFullCSV = window.saveToCSV;

window.navigate = mode => {
  if (mode === "scan") {
    $("scanSection").style.display = "block";
    $("rankingSection").style.display = "none";
    initCamera();
    if (qrReaderRanking && qrActiveRanking) {
      qrReaderRanking.stop();
      qrActiveRanking = false;
    }
  } else if (mode === "ranking") {
    $("scanSection").style.display = "none";
    $("rankingSection").style.display = "block";
    if (qrReaderScan && qrActiveScan) {
      qrReaderScan.stop();
      qrActiveScan = false;
    }
    initRankingCamera();
  }
};

window.navigateToExternal = url => {
  window.open(url, "_blank");
};

window.btnSave = $("btnSave");
window.btnLoad = $("btnLoad");
window.btnSave.onclick = () => {
  saveGame()
    .then(() => message("☁ Drive保存完了"))
    .catch(e => message("保存失敗:" + e.message));
};
window.btnLoad.onclick = () => {
  loadGame()
    .then(() => message("☁ Drive読み込み完了"))
    .catch(e => message("読み込み失敗:" + e.message));
};

window.onload = () => {
  loadGame().then(() => initCamera());
};
