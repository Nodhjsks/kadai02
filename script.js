// ===== 変数：ゲームの状態 =====
const SIZE = 6;
let board;            // SIZE×SIZEマス。0=空き, 1=プレイヤー1, 2=プレイヤー2
let turn;             // 今、マスを選ぶ人
let selected;         // 選択中のマス（-1は未選択）
let busy;             // 手押し相撲の最中かどうか
let changed = [];     // 直前に変わったマス（裏返しの演出用）
let bonus = [];       // ⚡マスの位置（一発逆転マス）
const mark = {1:"○", 2:"×"};
const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

function name(p){
  const v = document.getElementById("n" + p).value.trim();
  return v || ("プレイヤー" + p);
}
function count(p){ return board.filter(function(v){ return v === p; }).length; }
function other(p){ return p === 1 ? 2 : 1; }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

// ===== オセロ判定：マスiにpが置いたとき、裏返るマスの一覧 =====
function flipsFor(i, p){
  const r = Math.floor(i / SIZE), c = i % SIZE;
  const result = [];
  dirs.forEach(function(d){
    const line = [];
    let rr = r + d[0], cc = c + d[1];
    // 相手のマスが続くあいだ進む
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr * SIZE + cc] === other(p)) {
      line.push(rr * SIZE + cc);
      rr += d[0]; cc += d[1];
    }
    // 分岐：その先が自分のマスなら、挟めたので裏返す
    if (line.length > 0 && rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr * SIZE + cc] === p) {
      line.forEach(function(x){ result.push(x); });
    }
  });
  return result;
}

// ===== ⚡マス：同じ行・列にいる相手のマスを全部裏返す =====
function bonusFlips(i, p){
  if (!bonus.includes(i)) return [];   // 分岐：⚡マスでなければ何もなし
  const r = Math.floor(i / SIZE), c = i % SIZE;
  const result = [];
  board.forEach(function(v, j){
    const sameLine = (Math.floor(j / SIZE) === r) || (j % SIZE === c);
    if (sameLine && v === other(p)) result.push(j);
  });
  return result;
}

// 通常の裏返し＋⚡の裏返し（重複なし）
function allFlips(i, p){
  const list = flipsFor(i, p);
  bonusFlips(i, p).forEach(function(x){
    if (!list.includes(x)) list.push(x);
  });
  return list;
}

// ===== 置けるマスの一覧（相手を1枚以上挟めるマス） =====
function legalMoves(p){
  const list = [];
  const wiped = (count(p) === 0);   // コマが全滅していたら、空きマスならどこでも置ける
  board.forEach(function(v, i){
    if (v === 0 && (wiped || flipsFor(i, p).length > 0)) list.push(i);
  });
  return list;
}

// 次の番へ。置ける場所がなければパスして、パスした人を返す（いなければ0）
function nextTurn(){
  turn = other(turn);
  if (legalMoves(turn).length === 0 && legalMoves(other(turn)).length > 0) {
    const passed = turn;
    turn = other(turn);
    return passed;
  }
  return 0;
}

function endTurn(){
  const passed = nextTurn();
  if (passed) document.getElementById("say").textContent += " （" + name(passed) + " は置ける場所がなくパス）";
}

function pick(i){
  // 分岐：勝負中・埋まっている・選択済み・置けないマスは選べない
  if (busy || board[i] !== 0 || selected >= 0 || !legalMoves(turn).includes(i)) return;
  selected = i;
  changed = [];
  document.getElementById("say").textContent = "";
  render();
}

// ===== 土俵のお相撲さん（SVG）を動かす =====
const f1 = document.getElementById("f1");
const f2 = document.getElementById("f2");

// pos: -110〜110（プラスはプレイヤー1が押している）
function setPush(pos){
  const off = pos / 110;
  f1.style.transform = "translateX(" + (145 + off * 28) + "px) skewX(" + (-off * 9) + "deg)";
  f2.style.transform = "translateX(" + (255 + off * 28) + "px) skewX(" + (-off * 9) + "deg)";
}

// 負けた方が後ろに倒れる
function fall(loser){
  if (loser === 1) {
    f1.classList.add("fallen");
    f1.style.transform = "translateX(" + (145 - 28) + "px) rotate(-75deg)";
  } else {
    f2.classList.add("fallen");
    f2.style.transform = "translateX(" + (255 + 28) + "px) rotate(75deg)";
  }
}

// WIN! / LOSE の表示
function showResultLabels(winner){
  const w = document.getElementById("lab" + winner);
  const l = document.getElementById("lab" + other(winner));
  w.textContent = "WIN!";  w.setAttribute("class", "lab show win");
  l.textContent = "LOSE";  l.setAttribute("class", "lab show lose");
}

function resetFigures(){
  f1.classList.remove("fallen");
  f2.classList.remove("fallen");
  document.getElementById("lab1").setAttribute("class", "lab");
  document.getElementById("lab2").setAttribute("class", "lab");
  setPush(0);
}

// ===== 手押し相撲：勝敗は50%ずつ =====
async function fight(){
  if (selected < 0 || busy) return;
  busy = true;
  render();

  const winner = Math.random() < 0.5 ? 1 : 2;   // ここで50%ずつ決まる
  const sign = winner === 1 ? 1 : -1;
  const say = document.getElementById("say");
  resetFigures();
  say.textContent = bonus.includes(selected) ? "⚡ 一発逆転マスだ！ せーの…！" : "せーの…！";
  await sleep(600);

  // 押し合い：左右に揺れながら、だんだん大きくなる
  let dir = Math.random() < 0.5 ? 1 : -1;
  for (let k = 0; k < 6; k++) {
    setPush(dir * (15 + k * 8 + Math.random() * 12));
    say.textContent = k % 2 === 0 ? "えいっ！" : "ぐぐぐ…！";
    dir = -dir;
    await sleep(450);
  }
  setPush(sign * 112);          // 最後の一押しで決着
  await sleep(350);
  fall(other(winner));          // 負けた方が土俵に倒れる
  showResultLabels(winner);
  say.textContent = name(winner) + " の勝ち！";
  await sleep(900);

  // 勝者がそのマスに置いて、オセロのように裏返す
  const flips = allFlips(selected, winner);
  const isBonus = bonus.includes(selected);
  board[selected] = winner;
  flips.forEach(function(x){ board[x] = winner; });
  changed = flips.concat([selected]);
  say.textContent = name(winner) + " の勝ち！" + (isBonus ? " ⚡一発逆転！" : "") + (flips.length > 0 ? " " + flips.length + "枚ひっくり返した" : " ひっくり返せなかった");

  selected = -1;
  busy = false;
  endTurn();   // 次の番へ（置ける場所がなければパス）
  render();
}

function reset(){
  if (busy) return;
  board = Array(SIZE * SIZE).fill(0);
  // 最初の4マスを、中央あたりに置く
  const s = Math.floor(SIZE / 2) - 1;
  board[s * SIZE + s] = 2;
  board[s * SIZE + s + 1] = 1;
  board[(s + 1) * SIZE + s] = 1;
  board[(s + 1) * SIZE + s + 1] = 2;
  turn = 1; selected = -1; changed = [];
  // ⚡マスを、空きマスからランダムに選ぶ
  bonus = [];
  const empties = [];
  board.forEach(function(v, i){ if (v === 0) empties.push(i); });
  const n = Math.max(1, Math.floor(SIZE * SIZE / 8));
  while (bonus.length < n) {
    const k = Math.floor(Math.random() * empties.length);
    bonus.push(empties.splice(k, 1)[0]);
  }
  document.getElementById("say").textContent = "";
  resetFigures();
  render();
}

function render(){
  const c1 = count(1), c2 = count(2);
  const empty = board.length - c1 - c2;
  const legal = legalMoves(turn);
  // 終了：盤面が埋まった、または両方とも置けない
  const finished = (empty === 0) || (legal.length === 0 && legalMoves(other(turn)).length === 0);
  document.getElementById("s1").textContent = c1;
  document.getElementById("s2").textContent = c2;
  document.getElementById("nm1").textContent = name(1);
  document.getElementById("nm2").textContent = name(2);
  // 番のプレイヤーを強調する
  document.querySelector(".pl.p1").classList.toggle("active", !finished && turn === 1);
  document.querySelector(".pl.p2").classList.toggle("active", !finished && turn === 2);
  document.querySelector(".names").classList.toggle("playing", !finished);

  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = "repeat(" + SIZE + ", 1fr)";
  board.forEach(function(v, i){
    const selectable = (v === 0) && !busy && !finished && selected < 0 && legal.includes(i);
    const b = document.createElement("button");
    b.className = "cell" + (v === 1 ? " c1" : v === 2 ? " c2" : "") +
      (i === selected ? " sel" : "") + (changed.includes(i) ? " flip" : "") +
      (selectable ? " ok" : "");
    b.textContent = v === 0 ? ((busy && i === selected && bonus.includes(i)) ? "⚡" : "") : mark[v];
    b.disabled = !selectable;
    b.setAttribute("aria-label", (Math.floor(i / SIZE) + 1) + "行" + (i % SIZE + 1) + "列");
    b.onclick = function(){ pick(i); };
    grid.appendChild(b);
  });

  const status = document.getElementById("status");
  const info = document.getElementById("info");
  const go = document.getElementById("go");

  // 分岐：終了 / 勝負中 / マス選択済み / マス未選択
  if (finished) {
    status.textContent = "ゲーム終了";
    // 分岐：どちらが多いか、同数なら引き分け
    let result;
    if (c1 > c2) result = name(1) + " の勝ち！";
    else if (c2 > c1) result = name(2) + " の勝ち！";
    else result = "引き分け！";
    info.textContent = result + "（" + c1 + " 対 " + c2 + "）";
  } else if (busy) {
    status.textContent = "勝負中！";
    info.textContent = "";
  } else if (selected >= 0) {
    status.textContent = name(turn) + " さんが選んだマス";
    // 勝った場合・負けた場合に裏返る数を予告する（⚡の分は含まない）
    const win = flipsFor(selected, turn).length;
    const lose = flipsFor(selected, other(turn)).length;
    info.textContent = name(turn) + " が勝てば " + win + "枚裏返す／" + name(other(turn)) + " が勝てば " + lose + "枚裏返す（勝率は50%ずつ）";
  } else {
    status.textContent = name(turn) + " さんがマスを選ぶ番";
    info.textContent = (count(turn) === 0 ? "コマが全滅！空きマスならどこでも選べます（点線）。残り" : "置けるマス（点線）をタップ。残り") + empty + "マス";
  }
  status.style.color = finished ? "" : (turn === 1 ? "var(--p1)" : "var(--p2)");
  go.disabled = finished || busy || selected < 0;
}

reset();