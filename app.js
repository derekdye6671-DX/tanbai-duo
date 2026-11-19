// 坦白局 · 双人版 —— 游戏逻辑
// 题库在 questions.js，样式在 style.css。改样式不需要动这个文件。
(function () {
  "use strict";

  var TIER_NAMES = { 1: "温和", 2: "暧昧", 3: "私密", 4: "缠绵" };
  var TYPE_NAMES = { truth: "真心话", dare: "大冒险" };
  var LEVEL_UP_EVERY = 5;          // 每满 5 轮全员升一档
  var SAVE_KEY = "tanbai-duo-game";

  // ---------- 题库：读取并检查 ----------
  var BANK = [];
  var badCount = 0;
  (window.QUESTIONS || []).forEach(function (q, i) {
    var ok = q && [1, 2, 3, 4].indexOf(q.tier) >= 0 &&
      (q.type === "truth" || q.type === "dare") &&
      typeof q.text === "string" && q.text.trim() !== "";
    if (!ok) { badCount++; return; }
    BANK.push({
      id: q.id ? String(q.id) : "auto-" + i,
      tier: q.tier,
      type: q.type,
      category: q.category ? String(q.category) : TYPE_NAMES[q.type],
      text: q.text.trim(),
      seconds: q.type === "dare" && q.seconds > 0 ? Math.round(q.seconds) : 0
    });
  });

  // ---------- 小工具 ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function show(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.add("hidden"); });
    $(id).classList.remove("hidden");
    $("topbar").classList.toggle("hidden", id === "screen-setup");
    window.scrollTo(0, 0);
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {} }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }

  // 抽一道题：优先目标档位里没用过的；用完了就允许重复；
  // 这个档位这个类型一道都没有，就去最近的档位找。永远不会抽不到（只要题库不空）。
  function draw(tier, type, excludeIds) {
    var order = [tier];
    for (var d = 1; d <= 3; d++) { order.push(tier + d, tier - d); }
    for (var k = 0; k < order.length; k++) {
      var t = order[k];
      if (t < 1 || t > 4) continue;
      var all = BANK.filter(function (q) { return q.tier === t && q.type === type; });
      if (!all.length) continue;
      var fresh = all.filter(function (q) { return G.used.indexOf(q.id) < 0 && excludeIds.indexOf(q.id) < 0; });
      var pool = fresh.length ? fresh : all.filter(function (q) { return excludeIds.indexOf(q.id) < 0; });
      if (!pool.length) pool = all;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  }

  // ---------- 游戏状态 ----------
  var G = null;
  var timerHandle = null;

  function newGame(nameA, nameB, startTier, total) {
    G = {
      players: [
        { name: nameA, tier: startTier, done: 0, escaped: 0 },
        { name: nameB, tier: startTier, done: 0, escaped: 0 }
      ],
      startTier: startTier,
      total: total,
      round: 1,
      used: [],
      cards: [],      // 本轮两张牌（一张真心话、一张大冒险）
      swapped: false,
      chosen: null,   // 被选中的牌在 cards 里的位置
      timerLeft: null, // 本轮倒计时剩余秒数，null = 未开始
      event: "",      // 显示在交接页的升档提示
      history: [],
      phase: "handoff"
    };
  }
  // 第 1 轮：玩家1 问 玩家2；之后轮流（上一轮被问的人出下一题）
  function askerIdx() { return G.round % 2 === 1 ? 0 : 1; }
  function targetIdx() { return 1 - askerIdx(); }

  function dealCards() {
    var t = G.players[targetIdx()].tier;
    var a = draw(t, "truth", []);
    var b = draw(t, "dare", a ? [a.id] : []);
    G.cards = [a, b].filter(Boolean);
    G.swapped = false;
    G.chosen = null;
  }

  // ---------- 画面 ----------
  function renderTop() {
    $("round-info").textContent = "第 " + G.round + " / " + G.total + " 轮";
    $("tier-info").innerHTML = G.players.map(function (p) {
      return '<span class="badge tier' + p.tier + '">' + esc(p.name) + " · " + TIER_NAMES[p.tier] + "</span>";
    }).join("");
  }

  function goHandoff() {
    G.phase = "handoff"; save(); renderTop();
    var asker = G.players[askerIdx()], target = G.players[targetIdx()];
    $("handoff-event").textContent = G.event;
    $("handoff-event").classList.toggle("hidden", !G.event);
    $("handoff-text").textContent = "把手机交给 " + asker.name;
    $("handoff-sub").textContent = target.name + " 先别看屏幕";
    $("btn-handoff").textContent = "我是 " + asker.name + "，开始出题";
    show("screen-handoff");
  }

  function cardHtml(q, open, extraBtn) {
    return '<div class="card tier' + q.tier + (open ? " open" : "") + '">' +
      '<div class="card-head"><span>' + TYPE_NAMES[q.type] + " · " + esc(q.category) + "</span>" +
      '<span class="card-tier">' + TIER_NAMES[q.tier] + "</span></div>" +
      (open ? '<div class="card-text">' + esc(q.text) + "</div>" : '<div class="card-text blind">？</div>') +
      (extraBtn || "") + "</div>";
  }

  function goAsk() {
    G.phase = "ask";
    if (!G.cards.length) dealCards();
    save(); renderTop();
    var target = G.players[targetIdx()];
    $("ask-title").textContent = "给 " + target.name + " 出题（" + TIER_NAMES[target.tier] + "）";
    $("ask-cards").innerHTML = G.cards.map(function (q, i) {
      var btn = G.swapped ? "" : '<button class="btn small swap" data-i="' + i + '">换一张</button>';
      return cardHtml(q, true, btn);
    }).join("");
    $("btn-to-pick").textContent = "交给 " + target.name + " 选";
    show("screen-ask");
  }

  function swapCard(i) {
    if (G.swapped) return;
    var old = G.cards[i];
    var other = G.cards[1 - i];
    var q = draw(G.players[targetIdx()].tier, old.type, [old.id].concat(other ? [other.id] : []));
    if (q) G.cards[i] = q;
    G.swapped = true;
    goAsk();
  }

  function goPick() {
    G.phase = "pick"; save(); renderTop();
    var target = G.players[targetIdx()];
    $("pick-title").textContent = target.name + " 选一张";
    $("pick-cards").innerHTML = G.cards.map(function (q, i) {
      return '<button class="pick" data-i="' + i + '">' + cardHtml(q, false) + "</button>";
    }).join("");
    show("screen-pick");
  }

  function goReveal() {
    G.phase = "reveal"; save(); renderTop();
    var q = G.cards[G.chosen];
    $("reveal-card").outerHTML = '<div id="reveal-card">' + cardHtml(q, true) + "</div>";
    stopTimer();
    // G.timerLeft：null/undefined = 还没开始计时（旧存档也是这样）；数字 = 已开始，刷新后暂停在这个秒数
    var left = G.timerLeft == null ? null : G.timerLeft;
    $("timer-box").classList.toggle("hidden", !q.seconds);
    $("timer-num").textContent = !q.seconds ? "" : left === null ? q.seconds + " 秒" : left > 0 ? left + " 秒" : "时间到";
    $("btn-timer").textContent = left === null ? "开始计时" : "继续计时";
    $("btn-timer").disabled = left !== null && left <= 0;
    $("btn-done").textContent = q.type === "dare" ? "做到了" : "答了";
    show("screen-reveal");
  }

  function startTimer() {
    var q = G.cards[G.chosen];
    var left = G.timerLeft == null ? q.seconds : G.timerLeft;
    if (left <= 0) return;
    $("btn-timer").disabled = true;
    stopTimer();
    G.timerLeft = left; save();   // 每秒保存一次剩余秒数，刷新后从这里暂停（最多少算不到 1 秒）
    timerHandle = setInterval(function () {
      left--;
      G.timerLeft = Math.max(left, 0); save();
      $("timer-num").textContent = left > 0 ? left + " 秒" : "时间到";
      if (left <= 0) stopTimer();
    }, 1000);
  }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

  function finishRound(escaped) {
    stopTimer();
    G.timerLeft = null;
    var q = G.cards[G.chosen];
    var ti = targetIdx();
    var target = G.players[ti];
    G.used.push(q.id);
    G.history.push({ round: G.round, asker: askerIdx(), target: ti, q: q, escaped: escaped, tierAtTime: target.tier });
    var events = [];
    if (escaped) {
      target.escaped++;
      if (target.tier < 4) { target.tier++; events.push(target.name + " 逃了，升到「" + TIER_NAMES[target.tier] + "」"); }
      else events.push(target.name + " 逃了（已经是最高档）");
    } else {
      target.done++;
    }
    if (G.round % LEVEL_UP_EVERY === 0 && G.round < G.total) {
      var up = false;
      G.players.forEach(function (p) { if (p.tier < 4) { p.tier++; up = true; } });
      if (up) events.push("满 " + LEVEL_UP_EVERY + " 轮，全员升一档");
    }
    G.event = events.join("；");
    G.cards = [];
    if (G.round >= G.total) { goReport(); return; }
    G.round++;
    goHandoff();
  }

  // 最大胆的一题：完成了的题里档位最高的；同档位优先大冒险，再取最近的
  function boldest() {
    var best = null;
    G.history.forEach(function (h) {
      if (h.escaped) return;
      if (!best || h.q.tier > best.q.tier ||
        (h.q.tier === best.q.tier && (h.q.type === "dare" || best.q.type !== "dare"))) best = h;
    });
    return best;
  }

  function goReport() {
    G.phase = "report"; save(); renderTop();
    var b = boldest();
    var rows = G.players.map(function (p) {
      return "<tr><td>" + esc(p.name) + "</td><td>答 " + p.done + "</td><td>逃 " + p.escaped +
        "</td><td>" + TIER_NAMES[p.tier] + "</td></tr>";
    }).join("");
    $("report-card").innerHTML =
      '<h2 class="report-title">战报卡</h2>' +
      '<p class="hint">共 ' + G.total + " 轮 · 起始档位 " + TIER_NAMES[G.startTier] + "</p>" +
      '<table class="report-table"><tr><th>玩家</th><th>答了</th><th>逃了</th><th>最终档位</th></tr>' + rows + "</table>" +
      '<h3 class="report-sub">今晚最大胆的一题</h3>' +
      (b ? '<div class="report-bold">' + cardHtml(b.q, true) +
        '<p class="hint">第 ' + b.round + " 轮 · " + esc(G.players[b.target].name) + " 完成</p></div>"
        : '<p class="hint">这局没人完成过题目。</p>');
    show("screen-report");
  }

  // ---------- 开局页 ----------
  function initSetup() {
    $("start-tier").innerHTML = [1, 2, 3, 4].map(function (t) {
      return '<option value="' + t + '">' + TIER_NAMES[t] + "</option>";
    }).join("");
    var counts = [1, 2, 3, 4].map(function (t) {
      return TIER_NAMES[t] + " " + BANK.filter(function (q) { return q.tier === t; }).length;
    });
    $("bank-info").textContent = "题库共 " + BANK.length + " 题（" + counts.join("，") + "）" +
      (badCount ? "，有 " + badCount + " 题格式不对已跳过" : "");
    if (!BANK.length) {
      $("btn-start").disabled = true;
      $("bank-info").textContent = "题库是空的或格式不对，请检查 questions.js";
    }
    var saved = loadSave();
    $("btn-resume").classList.toggle("hidden", !(saved && saved.phase && saved.phase !== "report"));
    show("screen-setup");
  }

  // ---------- 按钮 ----------
  $("btn-start").addEventListener("click", function () {
    var a = $("name-a").value.trim() || "玩家1";
    var b = $("name-b").value.trim() || "玩家2";
    var tier = parseInt($("start-tier").value, 10) || 1;
    var total = parseInt($("total-rounds").value, 10);
    if (!(total >= 2 && total <= 50)) total = 10;
    newGame(a, b, tier, total);
    goHandoff();
  });
  $("btn-resume").addEventListener("click", function () {
    G = loadSave();
    if (!G) { initSetup(); return; }
    if (G.phase === "ask") goAsk();
    else if (G.phase === "pick") goPick();
    else if (G.phase === "reveal") goReveal();
    else goHandoff();
  });
  $("btn-handoff").addEventListener("click", function () { G.event = ""; G.cards = []; goAsk(); });
  $("ask-cards").addEventListener("click", function (e) {
    var b = e.target.closest(".swap");
    if (b) swapCard(parseInt(b.getAttribute("data-i"), 10));
  });
  $("btn-to-pick").addEventListener("click", goPick);
  $("pick-cards").addEventListener("click", function (e) {
    var b = e.target.closest(".pick");
    if (!b) return;
    G.chosen = parseInt(b.getAttribute("data-i"), 10);
    goReveal();
  });
  $("btn-timer").addEventListener("click", startTimer);
  $("btn-done").addEventListener("click", function () { finishRound(false); });
  $("btn-escape").addEventListener("click", function () { finishRound(true); });
  $("btn-again").addEventListener("click", function () { clearSave(); G = null; initSetup(); });

  initSetup();
})();
