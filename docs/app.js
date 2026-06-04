"use strict";

// Formatação locale-aware: muda com o idioma (pt-BR ↔ en-US). Ver bloco I18N.
let LANG = "pt";
const _loc = () => (LANG === "en" ? "en-US" : "pt-BR");
const _dec = () => (LANG === "en" ? "." : ",");
let NF = new Intl.NumberFormat(_loc());
let BRL2 = new Intl.NumberFormat(_loc(), { style: "currency", currency: "BRL" });
let BRL0 = new Intl.NumberFormat(_loc(), { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
function refmtLocale() {
  NF = new Intl.NumberFormat(_loc());
  BRL2 = new Intl.NumberFormat(_loc(), { style: "currency", currency: "BRL" });
  BRL0 = new Intl.NumberFormat(_loc(), { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
const PCT = (x) => (x == null ? "—" : (x * 100).toFixed(1).replace(".", _dec()) + "%");
const PCT0 = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
const fmt = (x) => (x == null ? "—" : NF.format(x));
const sig = (x) => (x == null ? "—" : (x > 0 ? "+" : "") + x.toFixed(1).replace(".", _dec()) + "%");
const sig0 = (x) => (x == null ? "—" : (x > 0 ? "+" : "") + fmt(x));
// valor compacto: R$ 1,2 bi / R$ 340 mi / R$ 27 mil / R$ 912 (sufixos via t())
function moeda(x) {
  if (x == null) return "—";
  const a = Math.abs(x);
  if (a >= 1e9) return "R$ " + (x / 1e9).toFixed(1).replace(".", _dec()) + " " + t("suf_bi");
  if (a >= 1e6) return "R$ " + (x / 1e6).toFixed(1).replace(".", _dec()) + " " + t("suf_mi");
  if (a >= 1e4) return "R$ " + Math.round(x / 1e3) + " " + t("suf_mil");
  return BRL0.format(x);
}
const REPO_URL = "https://github.com/pablonora/transparencia-eleitoral-municipios";
function initChrome() {
  const gh = document.getElementById("ghLink");
  if (gh) gh.href = REPO_URL;
  const topo = document.getElementById("topoBtn");
  if (topo) {
    topo.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    const onScroll = () => topo.classList.toggle("show", window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
}
const temaClaro = () => document.documentElement.dataset.theme === "light";
function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById("temaBtn");
  if (btn) {
    btn.textContent = t === "light" ? "🌙" : "☀️";
    btn.setAttribute("aria-label", t === "light" ? "Mudar para tema escuro" : "Mudar para tema claro");
  }
}
function initTema() {
  aplicarTema(temaClaro() ? "light" : "dark");   // já definido pelo script do <head>
  const btn = document.getElementById("temaBtn");
  if (btn) btn.addEventListener("click", () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");                 // liga a transição suave
    const novo = temaClaro() ? "dark" : "light";
    aplicarTema(novo);
    try { localStorage.setItem("tema", novo); } catch (_) {}
    if (MAP && ufLayer) recolorMapa();                // repinta cores do mapa (calculadas em JS)
    setTimeout(() => root.classList.remove("theme-anim"), 250);
  });
}
const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dataEleit() {
  const s = (DADOS && DADOS.ano_eleitorado) || "";
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return s;
  const mes = (LANG === "en" ? MESES_EN : MESES_PT)[+m[2] - 1];
  return LANG === "en" ? `${mes} ${m[3]}` : `${mes}/${m[3]}`;
}

/* ---------------- I18N (sem biblioteca; espelha o toggle de tema) ---------------- */
let I18N = { pt: {}, en: {} };
function t(key, vars) {
  const d = I18N[LANG] || {};
  let s = (d[key] != null) ? d[key] : (I18N.pt[key] != null ? I18N.pt[key] : key);
  if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k] == null ? "" : vars[k]);
  return s;
}
async function carregarI18n() {
  try {
    const [pt, en] = await Promise.all([
      fetch("i18n/pt.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("i18n/en.json", { cache: "no-store" }).then((r) => r.json()),
    ]);
    I18N = { pt, en };
  } catch (e) { console.warn("i18n: falha ao carregar dicionários", e); }
}
// devolve a tradução SÓ se existir (pt ou idioma atual); senão null — assim o
// texto de fallback já presente no HTML é preservado caso o dicionário falhe.
function _tr(key) {
  const d = I18N[LANG] || {};
  if (d[key] != null) return d[key];
  if (I18N.pt && I18N.pt[key] != null) return I18N.pt[key];
  return null;
}
function aplicarI18nDOM() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = _tr(el.dataset.i18n); if (v != null) el.innerHTML = v;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const v = _tr(el.dataset.i18nPh); if (v != null) el.placeholder = v;
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const v = _tr(el.dataset.i18nTitle); if (v != null) el.title = v.replace(/<[^>]+>/g, "");
  });
}
function aplicarIdioma(lang) {
  LANG = (lang === "en") ? "en" : "pt";
  refmtLocale();
  document.documentElement.lang = (LANG === "en") ? "en-US" : "pt-BR";
  const _ti = _tr("title"); if (_ti) document.title = _ti;
  const md = document.querySelector('meta[name="description"]'); const _md = _tr("meta_desc"); if (md && _md) md.content = _md;
  const ogl = document.querySelector('meta[property="og:locale"]'); if (ogl) ogl.content = (LANG === "en") ? "en_US" : "pt_BR";
  const btn = document.getElementById("idiomaBtn");
  if (btn) {
    btn.textContent = (LANG === "en") ? "🇺🇸" : "🇧🇷";
    btn.setAttribute("aria-label", LANG === "en" ? "Mudar para português" : "Switch to English");
  }
  aplicarI18nDOM();
  // re-render de tudo que é montado em JS, para refletir idioma + formatação locale
  if (DADOS) {
    preencherTextos(); renderHero();
    if (typeof renderHistograma === "function") renderHistograma();
    if (typeof renderRanking === "function") renderRanking();
    if (typeof renderCompare === "function") renderCompare();
    if (typeof render === "function") render();
    if (typeof renderFontes === "function") renderFontes();
    if (MAP && ufLayer) { legend(); recolorMapa(); }
    // perfil aberto: re-render para traduzir
    const modal = document.getElementById("modal");
    if (modal && !modal.hidden && window._cidadeAberta) abrirCidade(window._cidadeAberta);
  }
}
function initIdioma() {
  let saved = null; try { saved = localStorage.getItem("idioma"); } catch (_) {}
  const q = new URLSearchParams(location.search).get("lang");
  const nav = (navigator.language || "pt").toLowerCase();
  const escolhido = (q === "en" || q === "pt") ? q : (saved || (nav.startsWith("en") ? "en" : "pt"));
  aplicarIdioma(escolhido);
  const btn = document.getElementById("idiomaBtn");
  if (btn) btn.addEventListener("click", () => {
    const novo = (LANG === "pt") ? "en" : "pt";
    aplicarIdioma(novo);
    try { localStorage.setItem("idioma", novo); } catch (_) {}
  });
}

const LIMITE_LINHAS = 800;
const NCOLS = 10;

let DADOS = null, META = null, LINHAS = [];
let ordenarPor = "razao_total", ordemDesc = true;
const flagsAtivas = new Set();
let busca = "", ufSel = "";

async function carregar() {
  // no-store: o JSON é regenerado pelo pipeline; sempre buscar a versão atual.
  const [a, b] = await Promise.all([
    fetch("data/brasil.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("data/meta.json", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    carregarI18n(),
  ]);
  DADOS = a; META = b; LINHAS = a.municipios;
  document.getElementById("th-anopop").textContent = "(" + a.ano_populacao + ")";
  document.getElementById("nMun").textContent = fmt(a.resumo.n_municipios);
  initTema();
  initChrome();
  initIdioma();
  computeRanks();
  preencherTextos();
  renderHero();
  initBuscaCidade();
  initTicker();
  initMapa();
  renderHistograma();
  initRankTabs();
  renderRanking();
  initComparar();
  preencherUFs(a.ufs || []);
  renderFontes();
  bind();
  render();
  abrirDeepLink();
}

/* ---------------- TEXTOS EXPLICATIVOS ---------------- */
function preencherTextos() {
  const r = DADOS.resumo;
  const r16 = LINHAS.filter((m) => m.razao_16mais != null);
  const pct16 = Math.round(100 * r16.filter((m) => m.razao_16mais > 1).length / r16.length);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("ex-n100", fmt(r.n_mais_eleitores_que_pop));
  set("ex-r16pct", pct16 + "%");
  set("meto-anopop", DADOS.ano_populacao);
  set("meto-ger", DADOS.ano_eleitorado ? "(geração " + DADOS.ano_eleitorado + ")" : "");
}

/* ---------------- HERO ---------------- */
function renderHero() {
  const r = DADOS.resumo;
  const top = LINHAS[0]; // já vem ordenado por razão desc
  document.getElementById("lede").innerHTML = t("lede", { n: fmt(r.n_mais_eleitores_que_pop) });

  const stats = [
    { v: fmt(r.n_mais_eleitores_que_pop), l: t("stat_100"), alt: false },
    { v: PCT0(r.razao_total_max), l: t("stat_maior", { local: `${top.nome}-${top.uf}` }), alt: true },
    { v: fmt(r.n_outlier_nacional), l: t("stat_outlier"), alt: false },
    { v: fmt(r.n_municipios), l: t("stat_total"), alt: true },
  ];
  document.getElementById("heroStats").innerHTML = stats.map((s) =>
    `<div class="stat ${s.alt ? "alt" : ""}"><div class="v">${s.v}</div><div class="l">${s.l}</div></div>`).join("");

  const txt = encodeURIComponent(t("tweet_hero", { n: fmt(r.n_mais_eleitores_que_pop) }));
  document.getElementById("btnTweet").href =
    `https://twitter.com/intent/tweet?text=${txt}&url=${encodeURIComponent(location.href)}`;

  document.getElementById("anosRef").innerHTML = t("anos_ref", { ger: dataEleit(), ano: DADOS.ano_populacao });
}

/* ---------------- HISTOGRAMA ---------------- */
let histInd = "razao";
function renderHistograma() {
  const base = ufSel ? LINHAS.filter((m) => m.uf === ufSel) : LINHAS;
  const nm = document.getElementById("nMun"); if (nm) nm.textContent = fmt(base.length);
  const ind = MAP_INDS[histInd] || MAP_INDS.razao;
  const isRaz = (histInd === "razao" || histInd === "razao16");  // têm o pivô do 100%
  const vals = base.map(ind.val).filter((x) => x != null).sort((a, b) => a - b);
  const el = document.getElementById("histograma"), leg = document.getElementById("histLegenda");
  if (!vals.length) { el.innerHTML = ""; leg.innerHTML = ""; return; }
  const NB = 26;
  const qq = (p) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))];
  // razão usa faixa fixa (visual consagrado); demais indicadores, faixa p2–p98
  let lo, hi;
  if (histInd === "razao") { lo = 0.4; hi = 1.7; }
  else { lo = qq(0.02); hi = qq(0.98); }
  if (hi <= lo) hi = lo + (Math.abs(lo) || 1);
  const step = (hi - lo) / NB;
  const bins = new Array(NB + 1).fill(0);        // última barra = overflow (≥ hi)
  vals.forEach((x) => { if (x >= hi) bins[NB]++; else bins[Math.max(0, Math.floor((x - lo) / step))]++; });
  const maxB = Math.max(...bins, 1);
  const barras = bins.map((c, i) => {
    const ini = lo + i * step;
    const hot = isRaz && ini >= 1.0;
    const faixa = i === NB ? `≥ ${ind.fmt(hi)}` : `${ind.fmt(ini)}–${ind.fmt(ini + step)}`;
    return `<div class="hbar ${hot ? "hot" : ""}" style="height:${(c / maxB) * 100}%"><span class="tip">${t("hist_tip", { faixa, n: fmt(c) })}</span></div>`;
  });
  if (isRaz && lo < 1.0 && hi > 1.0) {
    barras.splice(Math.round((1.0 - lo) / step), 0, `<div class="hist-div"><span class="hd-tag">100%</span></div>`);
  }
  el.innerHTML = barras.join("");
  if (isRaz) {
    const nGt = vals.filter((x) => x > 1).length, nLe = vals.length - nGt;
    leg.innerHTML = `<span><span class="sw" style="background:#46e0c0"></span>${t("hist_leg_le", { n: fmt(nLe) })}</span>
     <span><span class="sw" style="background:#ffd23f"></span>${t("hist_leg_gt", { n: fmt(nGt) })}</span>`;
  } else {
    leg.innerHTML = `<span>${t("hist_leg_generic", { label: t(ind.label), lo: ind.fmt(vals[0]), med: ind.fmt(qq(0.5)), hi: ind.fmt(vals[vals.length - 1]) })}</span>`;
  }
}

/* ---------------- RANKING (abas) ---------------- */
let rankAtual = "razao";
function rankDefs() {
  const anoT = (LINHAS.find((m) => m.transferencias_ano) || {}).transferencias_ano;
  return {
    razao: { titulo: t("rank_t_razao"), val: (m) => m.razao_total, fmt: PCT0, linha100: true },
    saldo: { titulo: t("rank_t_saldo", { ano: anoT }), val: (m) => m.transferencias_saldo, fmt: sig0 },
    idoso: { titulo: t("rank_t_idoso"), val: (m) => m.pct_70mais, fmt: PCT },
    jovem: { titulo: t("rank_t_jovem"), val: (m) => m.pct_16_17, fmt: PCT },
    escol: { titulo: t("rank_t_escol"), val: (m) => m.pct_ate_fundamental, fmt: PCT },
    facult: { titulo: t("rank_t_facult"), val: (m) => (m.eleitores ? m.eleitores_facultativo / m.eleitores : null), fmt: PCT },
    abst: { titulo: t("rank_t_abst"), val: (m) => m._abst, fmt: PCT },
    margem: {
      titulo: t("rank_t_margem"),
      val: (m) => (m.eleicao2024 && m.eleicao2024.entrada_maior_que_margem) ? m.eleicao2024.transf_saldo : null,
      fmt: (v) => "+" + fmt(v),
    },
    rev3: {
      titulo: t("rank_t_rev3"),
      val: (m) => (m.revisao && m.revisao.atende_3) ? m.razao_total : null,
      fmt: PCT,
    },
    gasto: {
      titulo: t("rank_t_gasto", { ano: DADOS.ano_contas || 2024 }),
      val: (m) => (m.contas ? m.contas.despesa_por_eleitor : null),
      fmt: (v) => BRL2.format(v),
    },
    orc: {
      titulo: t("orc_tab_t"),
      val: (m) => (m.orcamento && m.orcamento.saude != null && m.pop_total_estimada) ? m.orcamento.saude / m.pop_total_estimada : null,
      fmt: (v) => BRL0.format(v),
    },
    bn: {
      titulo: t("rank_t_bn"),
      val: (m) => (m.eleicao2024 ? m.eleicao2024.pct_brancos_nulos : null),
      fmt: PCT,
    },
  };
}
function renderRanking() {
  const def = rankDefs()[rankAtual];
  let pool = LINHAS.filter((m) => def.val(m) != null);
  if (ufSel) pool = pool.filter((m) => m.uf === ufSel);
  pool.sort((a, b) => def.val(b) - def.val(a));
  const top = pool.slice(0, 15);
  const maxV = Math.max(...top.map((m) => Math.abs(def.val(m))), 1e-9);
  const sub = document.getElementById("rankSub");
  const sensivel = (rankAtual === "margem" || rankAtual === "rev3" || rankAtual === "gasto" || rankAtual === "orc");
  sub.className = sensivel ? "sub rank-cuidado" : "sub";
  sub.innerHTML = (sensivel ? "⚠️ " : "") + def.titulo + (ufSel ? ` <strong>(${ufSel})</strong>` : "");
  document.getElementById("ranking").innerHTML = top.map((m) => {
    const v = def.val(m), w = (Math.abs(v) / maxV) * 100;
    const cem = def.linha100 && maxV > 1 ? `<div class="cem" style="left:${(1 / maxV) * 100}%"></div>` : "";
    return `<div class="rk" data-cd="${m.cd_ibge}">
      <div class="nm">${m.nome} <small>${m.uf}</small></div>
      <div class="track"><div class="fill" style="width:${w}%"></div>${cem}</div>
      <div class="val">${def.fmt(v)}</div>
    </div>`;
  }).join("");
}
function initRankTabs() {
  document.querySelectorAll("#rankTabs .tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll("#rankTabs .tab").forEach((x) => x.classList.remove("on"));
      t.classList.add("on"); rankAtual = t.dataset.rk; renderRanking();
    });
  });
  document.getElementById("ranking").addEventListener("click", (e) => {
    const rk = e.target.closest(".rk"); if (!rk) return;
    const m = munById && munById.get(rk.dataset.cd); if (m) abrirCidade(m);
  });
}

/* ---------------- DEMOGRAFIA ---------------- */
function demoGrid(m) {
  const items = [
    ["pct_16_17", t("demo_1617")],
    ["pct_70mais", t("demo_70")],
    ["pct_feminino", t("demo_mulheres")],
    ["pct_superior", t("demo_superior")],
    ["pct_ate_fundamental", t("demo_fundamental")],
  ].filter(([k]) => m[k] != null);
  if (!items.length) return "";
  return `<div class="demo">${items.map(([k, l]) =>
    `<div class="d"><b>${PCT(m[k])}</b> <span>${l}</span></div>`).join("")}</div>`;
}
function compBlock(m) {
  const c = m.comparecimento || {};
  const anos = ["2022", "2024"].filter((y) => c[y]);
  if (!anos.length) return "";
  const rotulo = { "2022": t("comp_2022"), "2024": t("comp_2024") };
  const fonteTxt = (s) => {
    if (!s) return "";
    const mm = /(\d{4})/.exec(s);
    return /[Cc]enso/.test(s) ? t("fonte_censo") : t("fonte_estim", { ano: mm ? mm[1] : "" });
  };
  return `<div class="comp-blk"><div class="cb-tit">${t("comp_tit")}</div>
    <div class="cb-cols">${
      anos.map((y) => `<div class="cb-col">
        <div class="cb-ano-tit">${rotulo[y]}</div>
        <div class="cb-linha"><span>${t("comp_ratio")}</span><b>${PCT(c[y].razao_epoca)}</b></div>
        <div class="cb-linha"><span>${t("comp_compareceram")}</span><b>${PCT(c[y].comp_pct)}</b></div>
        <div class="cb-linha"><span>${t("comp_abstencao")}</span><b class="ab">${PCT(c[y].abst_pct)}</b></div>
        <div class="cb-fonte">${t("comp_fonte", { fonte: fonteTxt(c[y].razao_epoca_fonte) })}</div>
      </div>`).join("")}</div></div>`;
}
// espectro ideológico (Bolognesi/Codato) — esquerda=vermelho, centro=branco, direita=azul
const ESP_COR = { esq: "#d6453c", centro: "#cfd3da", dir: "#3b6fd4" };
const ESP_KEY = { esq: "esp_esq", centro: "esp_centro", dir: "esp_dir" };
function espectroChip(esp) {
  return esp ? `<span class="esp"><span class="esp-dot" style="background:${ESP_COR[esp]}"></span>${t(ESP_KEY[esp])}</span>` : "";
}
function eleicaoBlock(m) {
  const e = m.eleicao2024;
  if (!e) return "";
  const turno = e.turno === "2" ? t("el_turno2") : t("el_turno1");
  let cruz = "";
  if (e.transf_saldo != null) {
    cruz = e.entrada_maior_que_margem
      ? `<div class="el-flag">${t("el_flag", { saldo: sig0(e.transf_saldo), margem: fmt(e.margem) })}</div>`
      : `<div class="cb-row"><span class="cb-ano">${t("el_entrada_lab")}</span>${t("el_entrada_val", { saldo: sig0(e.transf_saldo), margem: fmt(e.margem) })}</div>`;
  }
  let bn = "";
  if (e.pct_brancos != null) {
    bn = `<div class="cb-row"><span class="cb-ano">${t("el_brancos")}</span>${fmt(e.brancos)} <small>(${PCT(e.pct_brancos)})</small></div>
    <div class="cb-row"><span class="cb-ano">${t("el_nulos")}</span>${fmt(e.nulos)} <small>(${PCT(e.pct_nulos)})</small></div>`;
  }
  const part = e.partido ? `<div class="cb-row"><span class="cb-ano">${t("el_partido")}</span><b>${e.partido}</b> ${espectroChip(e.espectro)}</div>` : "";
  const espNota = e.espectro ? `<div class="cb-fonte">${t("nota_politica")}</div>` : "";
  return `<div class="comp-blk"><div class="cb-tit">${t("el_tit", { turno })}</div>
    <div class="cb-row"><span class="cb-ano">${t("el_vencedor")}</span><b>${e.vencedor}</b> · ${fmt(e.votos_venc)} ${t("el_votos_suf")}</div>
    ${part}
    <div class="cb-row"><span class="cb-ano">${t("el_margem_lab")}</span><b>${fmt(e.margem)}</b> ${t("el_votos_suf")}</div>
    ${bn}
    ${cruz}${espNota}</div>`;
}
function govBlock(m) {
  const g = DADOS.governadores && DADOS.governadores[m.uf];
  if (!g) return "";
  return `<div class="comp-blk"><div class="cb-tit">${t("gov_tit", { uf: m.uf })}</div>
    <div class="cb-row"><span class="cb-ano">${t("el_governador")}</span><b>${g.governador}</b> · ${g.partido} ${espectroChip(g.espectro)}</div>
    <div class="cb-fonte">${t("nota_politica")}</div></div>`;
}
function contasBlock(m) {
  const c = m.contas;
  if (!c) return "";
  const dpe = c.despesa_por_eleitor != null ? ` <small>(${t("ct_por_eleitor", { v: BRL2.format(c.despesa_por_eleitor) })})</small>` : "";
  return `<div class="comp-blk"><div class="cb-tit">${t("ct_tit", { ano: DADOS.ano_contas })}</div>
    <div class="cb-row"><span class="cb-ano">${t("ct_arrecadado")}</span><b>${moeda(c.receita_total)}</b></div>
    <div class="cb-row"><span class="cb-ano">${t("ct_gasto")}</span><b>${moeda(c.despesa_total)}</b>${dpe}</div>
    <div class="cb-row"><span class="cb-ano">${t("ct_prefeito")}</span>${moeda(c.despesa_prefeito)} <small>(${t("ct_cand_n", { n: fmt(c.n_cand_prefeito) })})</small></div>
    <div class="cb-row"><span class="cb-ano">${t("ct_vereadores")}</span>${moeda(c.despesa_vereador)}</div>
    <div class="cb-row"><span class="cb-ano">${t("ct_candidatos")}</span>${fmt(c.n_candidatos)}</div>
    <div class="cb-fonte">${t("nota_contas")}</div>
  </div>`;
}
function orcamentoBlock(m) {
  const o = m.orcamento;
  if (!o) return "";
  const pop = m.pop_total_estimada;
  const pcap = (v) => (v != null && pop ? `${BRL0.format(v / pop)}${t("orc_hab")}` : "");
  const pctd = (v) => (v != null && o.despesa ? PCT(v / o.despesa) : "");
  const linha = (lab, v) => v == null ? "" :
    `<div class="cb-row"><span class="cb-ano">${lab}</span>${moeda(v)} <small>${[pctd(v), pcap(v)].filter(Boolean).join(" · ")}</small></div>`;
  return `<div class="comp-blk"><div class="cb-tit">${t("orc_tit", { ano: DADOS.ano_orcamento })}</div>
    <div class="cb-row"><span class="cb-ano">${t("orc_receita")}</span><b>${moeda(o.receita)}</b></div>
    <div class="cb-row"><span class="cb-ano">${t("orc_despesa")}</span><b>${moeda(o.despesa)}</b>${pop ? ` <small>(${BRL0.format(o.despesa / pop)}${t("orc_hab")})</small>` : ""}</div>
    ${linha(t("orc_saude"), o.saude)}
    ${linha(t("orc_educacao"), o.educacao)}
    ${linha(t("orc_seguranca"), o.seguranca)}
    ${linha(t("orc_assistencia"), o.assistencia)}
    ${linha(t("orc_urbanismo"), o.urbanismo)}
    <div class="cb-fonte">${t("nota_orcamento")}</div>
  </div>`;
}
function criteriosBlock(m) {
  const r = m.revisao;
  if (!r) return "";
  const item = (ok, txt) => `<div class="cr-item ${ok ? "ok" : "no"}"><span class="cr-ic">${ok ? "✓" : "✕"}</span> ${txt}</div>`;
  const verd = r.atende_3
    ? `<div class="cr-verd sim">${t("cr_sim")}</div>`
    : `<div class="cr-verd nao">${t("cr_nao")}</div>`;
  return `<div class="comp-blk"><div class="cb-tit">${t("cr_tit")}</div>
    ${item(r.crit1_transferencias, t("cr_1"))}
    ${item(r.crit2_jovens_idosos, t("cr_2"))}
    ${item(r.crit3_acima_80, t("cr_3"))}
    ${verd}
    <div class="cb-fonte">${t("cr_fonte")}</div>
  </div>`;
}

/* ---------------- RANKS / MEDIANAS ---------------- */
let MED_NAC = null, MED_UF = {}, RANK_NAC_TOT = 0, RANK_TOT_UF = {};
const abstMaisRecente = (m) => {
  const c = m.comparecimento || {};
  return (c["2024"] && c["2024"].abst_pct != null) ? c["2024"].abst_pct
    : (c["2022"] && c["2022"].abst_pct != null) ? c["2022"].abst_pct : null;
};
function computeRanks() {
  munById = new Map(LINHAS.map((m) => [m.cd_ibge, m]));
  LINHAS.forEach((m) => { m._abst = abstMaisRecente(m); });
  MED_NAC = DADOS.resumo.razao_total_mediana;
  const byUf = {};
  LINHAS.forEach((m) => { (byUf[m.uf] || (byUf[m.uf] = [])).push(m); });
  const nac = LINHAS.filter((m) => m.razao_total != null).slice().sort((a, b) => b.razao_total - a.razao_total);
  nac.forEach((m, i) => { m._rankNac = i + 1; });
  RANK_NAC_TOT = nac.length;
  for (const uf in byUf) {
    const arr = byUf[uf].filter((m) => m.razao_total != null).slice().sort((a, b) => b.razao_total - a.razao_total);
    arr.forEach((m, i) => { m._rankUf = i + 1; });
    RANK_TOT_UF[uf] = arr.length;
    MED_UF[uf] = mediana(byUf[uf].map((m) => m.razao_total));
  }
}

/* ---------------- AUTOCOMPLETE ---------------- */
const semAcento = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function attachAutocomplete(input, acEl, onPick) {
  let sel = -1, opts = [];
  const close = () => { acEl.hidden = true; acEl.innerHTML = ""; sel = -1; opts = []; };
  const hl = () => acEl.querySelectorAll(".opt").forEach((el, i) => el.classList.toggle("sel", i === sel));
  const pick = (i) => { if (opts[i]) { onPick(opts[i]); input.value = opts[i].nome; close(); } };
  input.addEventListener("input", () => {
    const q = semAcento(input.value.trim());
    if (q.length < 2) return close();
    opts = LINHAS.filter((m) => semAcento(m.nome).includes(q)).slice(0, 8);
    if (!opts.length) return close();
    acEl.innerHTML = opts.map((m, i) => `<div class="opt" data-i="${i}">${m.nome} <small>${m.uf}</small></div>`).join("");
    acEl.hidden = false; sel = -1;
    acEl.querySelectorAll(".opt").forEach((el) => el.addEventListener("mousedown", (e) => { e.preventDefault(); pick(+el.dataset.i); }));
  });
  input.addEventListener("keydown", (e) => {
    if (acEl.hidden) return;
    if (e.key === "ArrowDown") { sel = Math.min(opts.length - 1, sel + 1); hl(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); hl(); e.preventDefault(); }
    else if (e.key === "Enter") { pick(sel >= 0 ? sel : 0); e.preventDefault(); }
    else if (e.key === "Escape") close();
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

/* ---------------- PERFIL DA CIDADE (modal) ---------------- */
function initBuscaCidade() {
  attachAutocomplete(document.getElementById("buscaCidade"), document.getElementById("acCidade"), abrirCidade);
  document.getElementById("modalBg").addEventListener("click", fecharModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
  document.getElementById("btnGeo").addEventListener("click", localizar);
}

/* ---------------- GEOLOCALIZAÇÃO (tudo no navegador) ---------------- */
// ray casting num anel [[lng,lat],...]
function pontoNoAnel(x, y, ring) {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) dentro = !dentro;
  }
  return dentro;
}
function pontoNaFeicao(x, y, geom) {
  if (!geom) return false;
  if (geom.type === "Polygon") return pontoNoAnel(x, y, geom.coordinates[0]);
  if (geom.type === "MultiPolygon") return geom.coordinates.some((p) => pontoNoAnel(x, y, p[0]));
  return false;
}
async function cidadePorCoord(lat, lng) {
  let ufs = UF_GEO;
  if (!ufs) ufs = (await fetch("data/malha/uf.json", { cache: "force-cache" }).then((r) => r.json())).features;
  const uf = ufs.find((f) => pontoNaFeicao(lng, lat, f.geometry));
  if (!uf) return null;
  const cod = String(uf.properties.codarea).padStart(2, "0");
  const gj = await fetch(`data/malha/mun_${cod}.json`, { cache: "force-cache" }).then((r) => r.json());
  const f = gj.features.find((ft) => pontoNaFeicao(lng, lat, ft.geometry));
  return f ? munById.get(String(f.properties.codarea)) || null : null;
}
function localizar() {
  const btn = document.getElementById("btnGeo");
  if (!navigator.geolocation) { toast(t("geo_indisp")); return; }
  btn.disabled = true; btn.textContent = t("geo_localizando");
  const reset = () => { btn.disabled = false; btn.textContent = t("geo_btn"); };
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const m = await cidadePorCoord(pos.coords.latitude, pos.coords.longitude);
      reset();
      if (m) abrirCidade(m);
      else toast(t("geo_nao_id"));
    } catch (_) { reset(); toast(t("geo_falha")); }
  }, () => { reset(); toast(t("geo_sem_loc")); },
    { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 });
}
function fecharModal() { document.getElementById("modal").hidden = true; window._cidadeAberta = null; }

function barRow(lab, v, max, cls) {
  const w = max ? Math.min(100, (v / max) * 100) : 0;
  return `<div class="row ${cls}"><span class="lab">${lab}</span><div class="track"><div class="fill" style="width:${w}%"></div></div><span>${PCT(v)}</span></div>`;
}
function cityCardHTML(m) {
  const medUf = MED_UF[m.uf], maxR = Math.max(m.razao_total || 0, medUf || 0, MED_NAC || 0) || 1;
  const per100 = Math.round((m.razao_total || 0) * 100);
  const saldoPct = m.eleitores && m.transferencias_saldo != null ? m.transferencias_saldo / m.eleitores : null;
  return `<button class="fechar" id="modalFechar" aria-label="Fechar">×</button>
  <div class="profile">
    <h3>${m.nome} <span class="uf-tag">${m.uf}</span></h3>
    <div class="big">${PCT(m.razao_total)}</div>
    <p class="frase">${t("city_frase", { per100, data: dataEleit(), ano: DADOS.ano_populacao })} ${badges(m) === "—" ? "" : badges(m)}</p>
    <div class="rankline">
      <div class="r">${t("city_rank_pais", { r: m._rankNac || "—", tot: fmt(RANK_NAC_TOT) })}</div>
      <div class="r">${t("city_rank_uf", { r: m._rankUf || "—", tot: fmt(RANK_TOT_UF[m.uf]), uf: m.uf })}</div>
      <div class="r" title="${t("th_razao16_t")}">
        <b>${PCT(m.razao_16mais)}</b><br>${t("city_r16_lab")}</div>
    </div>
    ${m.razao_16mais != null && m.razao_16mais > 1 ? `<p class="aviso16">${t("city_aviso16", { razao: PCT(m.razao_total) })}</p>` : ""}
    ${m.outlier_uf ? `<p class="ctx-uf">${t("city_ctx_uf", { uf: m.uf, lim: PCT((DADOS.limiares_estatisticos_por_uf || {})[m.uf]) })}</p>` : ""}
    <div class="cmp-cap">${t("city_cmp_cap")}</div>
    <div class="cmpbar">
      ${barRow(m.nome, m.razao_total, maxR, "me")}
      ${barRow(t("city_med_uf", { uf: m.uf }), medUf, maxR, "")}
      ${barRow(t("city_med_br"), MED_NAC, maxR, "")}
    </div>
    <div class="demo">
      <div class="d"><b>${fmt(m.eleitores)}</b> <span>${t("city_d_eleitores")}</span></div>
      <div class="d"><b>${fmt(m.pop_total_estimada)}</b> <span>${t("city_d_pop", { ano: DADOS.ano_populacao })}</span></div>
      ${m.crescimento_pop_pct != null ? `<div class="d"><b>${sig(m.crescimento_pop_pct)}</b> <span>${t("city_d_cresc", { de: m.ano_pop_anterior, para: m.ano_pop })}</span></div>` : ""}
      ${m.transferencias_qtd != null ? `<div class="d"><b>${fmt(m.transferencias_qtd)}</b> <span>${t("city_d_transf", { ano: m.transferencias_ano })}</span></div>` : ""}
      ${m.transferencias_saldo != null ? `<div class="d"><b>${sig0(m.transferencias_saldo)}</b> <span>${t("city_d_saldo", { pct: saldoPct != null ? " (" + PCT(saldoPct) + ")" : "" })}</span></div>` : ""}
    </div>
    ${demoGrid(m)}
    ${compBlock(m)}
    ${eleicaoBlock(m)}
    ${govBlock(m)}
    ${contasBlock(m)}
    ${orcamentoBlock(m)}
    ${criteriosBlock(m)}
    <p class="frase" style="font-size:.8rem; color:#9aa3b2; margin-top:1rem">${t("nota_neutra")}</p>
    <div class="acts">
      <button class="btn" id="pf-share">${t("city_share")}</button>
      <a class="btn ghost" id="pf-x" target="_blank" rel="noopener">${t("btn_tweet")}</a>
    </div>
  </div>`;
}
function linkCidade(m) {
  return location.origin + location.pathname + "?cidade=" + m.cd_ibge;
}
function abrirCidade(m) {
  window._cidadeAberta = m;
  document.getElementById("modalCard").innerHTML = cityCardHTML(m);
  document.getElementById("modal").hidden = false;
  document.getElementById("modalFechar").addEventListener("click", fecharModal);
  const per100 = Math.round((m.razao_total || 0) * 100);
  const link = linkCidade(m);
  document.getElementById("pf-x").href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(t("city_tweet", { local: `${m.nome}-${m.uf}`, per100 }))}&url=${encodeURIComponent(link)}`;
  document.getElementById("pf-share").addEventListener("click", async () => {
    try {
      if (navigator.share) { await navigator.share({ title: `${m.nome}-${m.uf}`, url: link }); return; }
      await navigator.clipboard.writeText(link); toast();
    } catch (_) { /* cancelado */ }
  });
}
function abrirDeepLink() {
  const cd = new URLSearchParams(location.search).get("cidade");
  if (cd && munById.has(cd)) abrirCidade(munById.get(cd));
}

/* ---------------- DESTAQUES (ticker) ---------------- */
function gerarInsights() {
  const r = DADOS.resumo, by = (f) => [...LINHAS].filter((m) => f(m) != null).sort((a, b) => f(b) - f(a))[0];
  const top = LINHAS[0];
  const idoso = by((m) => m.pct_70mais), saldo = by((m) => m.transferencias_saldo), jovem = by((m) => m.pct_16_17);
  const met = ufMetrics(); let ufTop = null;
  for (const uf in met) if (!ufTop || met[uf].pct100 > met[ufTop].pct100) ufTop = uf;
  const out = [
    t("ins_1", { local: `${top.nome}-${top.uf}`, pct: PCT0(top.razao_total) }),
    t("ins_2", { n: fmt(r.n_mais_eleitores_que_pop) }),
    saldo ? t("ins_3", { local: `${saldo.nome}-${saldo.uf}`, saldo: sig0(saldo.transferencias_saldo), ano: saldo.transferencias_ano }) : "",
    idoso ? t("ins_4", { local: `${idoso.nome}-${idoso.uf}`, pct: PCT(idoso.pct_70mais) }) : "",
    ufTop ? t("ins_5", { uf: ufTop, pct: PCT(met[ufTop].pct100) }) : "",
  ].filter(Boolean);
  return out;
}
function initTicker() {
  const el = document.getElementById("ticker"), ins = gerarInsights();
  if (!ins.length) return;
  el.innerHTML = ins[0]; let i = 0;
  setInterval(() => {
    el.classList.add("fade");
    setTimeout(() => { i = (i + 1) % ins.length; el.innerHTML = ins[i]; el.classList.remove("fade"); }, 400);
  }, 5000);
}

/* ---------------- COMPARAR CIDADES ---------------- */
let cmpAsel = null, cmpBsel = null;
function initComparar() {
  attachAutocomplete(document.getElementById("cmpA"), document.getElementById("acA"), (m) => { cmpAsel = m; renderCompare(); });
  attachAutocomplete(document.getElementById("cmpB"), document.getElementById("acB"), (m) => { cmpBsel = m; renderCompare(); });
}
// formatadores tolerantes a null para o comparador
const _moedaC = (v) => (v == null ? "—" : BRL2.format(v));
const _moedaH = (v) => (v == null ? "—" : BRL0.format(v));
const _ppsuf = () => (LANG === "en" ? " pp" : " p.p.");
const _ppF = (x) => (x * 100).toFixed(1).replace(".", _dec()) + _ppsuf();  // x é fração (0.108 → 10,8 p.p.)
const _ppN = (x) => x.toFixed(1).replace(".", _dec()) + _ppsuf();          // x já em pontos % (crescimento)
function renderCompare() {
  const out = document.getElementById("compareOut");
  if (!cmpAsel || !cmpBsel) { out.innerHTML = ""; return; }
  const A = cmpAsel, B = cmpBsel, ano = DADOS.ano_populacao;
  const anoT = A.transferencias_ano || B.transferencias_ano;
  const orcF = (chave) => (m) => (m.orcamento && m.orcamento[chave] != null && m.orcamento.despesa) ? m.orcamento[chave] / m.orcamento.despesa : null;
  const orcHab = (chave) => (m) => (m.orcamento && m.orcamento[chave] != null && m.pop_total_estimada) ? m.orcamento[chave] / m.pop_total_estimada : null;
  const abst = (m, y) => (m.comparecimento && m.comparecimento[y]) ? m.comparecimento[y].abst_pct : null;
  const _moedaK = (v) => (v == null ? "—" : moeda(v));
  // cada linha: {lab, f(acessor), fm(célula), d(magnitude do Δ, opcional)}; ou {grp}
  const rows = [
    { grp: t("cmp_g_proporcao") },
    { lab: t("cmp_r_razao"), f: (m) => m.razao_total, fm: PCT, d: _ppF },
    { lab: t("cmp_r_razao16"), f: (m) => m.razao_16mais, fm: PCT, d: _ppF },
    { lab: t("cmp_r_razao22"), f: (m) => (m.comparecimento && m.comparecimento["2022"]) ? m.comparecimento["2022"].razao_epoca : null, fm: PCT, d: _ppF },
    { lab: t("cmp_r_eleitores"), f: (m) => m.eleitores, fm: fmt },
    { lab: t("cmp_r_pop", { ano }), f: (m) => m.pop_total_estimada, fm: fmt },
    { grp: t("cmp_g_demografia") },
    { lab: t("cmp_r_1617"), f: (m) => m.pct_16_17, fm: PCT, d: _ppF },
    { lab: t("cmp_r_70"), f: (m) => m.pct_70mais, fm: PCT, d: _ppF },
    { lab: t("cmp_r_facult"), f: (m) => (m.eleitores ? m.eleitores_facultativo / m.eleitores : null), fm: PCT, d: _ppF },
    { lab: t("cmp_r_mulheres"), f: (m) => m.pct_feminino, fm: PCT, d: _ppF },
    { lab: t("cmp_r_superior"), f: (m) => m.pct_superior, fm: PCT, d: _ppF },
    { lab: t("cmp_r_fundamental"), f: (m) => m.pct_ate_fundamental, fm: PCT, d: _ppF },
    { grp: t("cmp_g_participacao") },
    { lab: t("cmp_r_cresc"), f: (m) => m.crescimento_pop_pct, fm: sig, d: _ppN },
    { lab: t("cmp_r_entradas", { ano: anoT }), f: (m) => m.transferencias_qtd, fm: fmt },
    { lab: t("cmp_r_saldo"), f: (m) => m.transferencias_saldo, fm: sig0, d: fmt },
    { lab: t("cmp_r_abst24"), f: (m) => abst(m, "2024"), fm: PCT, d: _ppF },
    { lab: t("cmp_r_abst22"), f: (m) => abst(m, "2022"), fm: PCT, d: _ppF },
    { lab: t("cmp_r_bn"), f: (m) => (m.eleicao2024 ? m.eleicao2024.pct_brancos_nulos : null), fm: PCT, d: _ppF },
    { lab: t("cmp_r_ncand"), f: (m) => (m.eleicao2024 ? m.eleicao2024.n_cand_1t : null), fm: fmt },
    { lab: t("cmp_r_partido"), f: (m) => (m.eleicao2024 ? m.eleicao2024.partido : null), fm: (v, m) => v ? `${v} ${espectroChip(m && m.eleicao2024 ? m.eleicao2024.espectro : null)}` : "—" },
    { lab: t("cmp_r_margem"), f: (m) => (m.eleicao2024 ? m.eleicao2024.margem : null), fm: fmt },
    { grp: t("cmp_g_dinheiro_camp") },
    { lab: t("cmp_r_receita_camp"), f: (m) => (m.contas ? m.contas.receita_total : null), fm: _moedaK },
    { lab: t("cmp_r_despesa_camp"), f: (m) => (m.contas ? m.contas.despesa_total : null), fm: _moedaK },
    { lab: t("cmp_r_gasto"), f: (m) => (m.contas ? m.contas.despesa_por_eleitor : null), fm: _moedaC },
    { grp: t("cmp_g_dinheiro_orc") },
    { lab: t("cmp_r_orc_receita_hab"), f: orcHab("receita"), fm: _moedaH },
    { lab: t("cmp_r_orc_despesa_hab"), f: orcHab("despesa"), fm: _moedaH },
    { lab: t("cmp_r_orc_saude"), f: orcF("saude"), fm: PCT, d: _ppF },
    { lab: t("cmp_r_orc_educ"), f: orcF("educacao"), fm: PCT, d: _ppF },
    { lab: t("cmp_r_orc_seg"), f: orcF("seguranca"), fm: PCT, d: _ppF },
  ];
  const dcell = (va, vb, dmag) => {
    if (va == null || vb == null || typeof va !== "number" || typeof vb !== "number") return `<td class="dlt">—</td>`;
    const dd = va - vb;
    if (Math.abs(dd) < 1e-9) return `<td class="dlt">=</td>`;
    return `<td class="dlt ${dd > 0 ? "da" : "db"}">${dd > 0 ? "+" : "−"}${dmag(Math.abs(dd))}</td>`;
  };
  let body = "";
  for (const r of rows) {
    if (r.grp) { body += `<tr class="cmp-grp"><td colspan="4">${r.grp}</td></tr>`; continue; }
    const va = r.f(A), vb = r.f(B);
    if (va == null && vb == null) continue;   // ambos sem dado: pula a linha
    const num = typeof va === "number" && typeof vb === "number";
    const aw = num && va > vb ? "win" : "";
    const bw = num && vb > va ? "win" : "";
    body += `<tr><td class="lab">${r.lab}</td><td class="${aw}">${r.fm(va, A)}</td><td class="${bw}">${r.fm(vb, B)}</td>${dcell(va, vb, r.d || r.fm)}</tr>`;
  }
  out.innerHTML = `<table class="cmp-table">
    <thead><tr><th></th>
      <th>${A.nome}<br><small>${A.uf} · ${t("cmp_id_rank", { r: A._rankNac || "—" })}</small></th>
      <th>${B.nome}<br><small>${B.uf} · ${t("cmp_id_rank", { r: B._rankNac || "—" })}</small></th>
      <th class="dlt-h">${t("cmp_delta")}</th></tr></thead>
    <tbody>${body}</tbody></table>
    <p class="cmp-nota">${t("cmp_delta_nota")}</p>`;
}

/* ---------------- MAPA ---------------- */
let MAP = null, ufLayer = null, munLayer = null, codToSigla = {};
let munById = null, loadedUFs = new Set(), labeled = new Set(), UF_GEO = null;
let zBrasil = 4, Z_MUNI = 5, Z_LABEL = 7;   // limiares de zoom (ajustados no init)

function mediana(xs) {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const i = a.length >> 1;
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
}

function ufMetrics() {
  const g = {};
  LINHAS.forEach((m) => {
    const x = g[m.uf] || (g[m.uf] = { razoes: [], n: 0, cem: 0, atip: 0 });
    if (m.razao_total != null) x.razoes.push(m.razao_total);
    x.n++; if (m.mais_eleitores_que_pop) x.cem++; if (m.outlier_nacional) x.atip++;
  });
  const out = {};
  for (const uf in g) out[uf] = { pct100: g[uf].cem / g[uf].n, mediana: mediana(g[uf].razoes), atipicos: g[uf].atip };
  return out;
}

// gradiente: azul-escuro → teal → âmbar → laranja
const STOPS = [[29, 59, 74], [70, 224, 192], [255, 210, 63], [255, 123, 61]];
function cor(t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(seg)), f = seg - i;
  const a = STOPS[i], b = STOPS[i + 1];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* indicadores que o mapa pode mostrar (recolorem UF e município) */
let mapInd = "razao", destaque = "todos", UF_AGG = {};
const MAP_INDS = {
  razao:   { label: "mi_razao", val: (m) => m.razao_total, div: [0.5, 1.0, 1.6], fmt: (v) => PCT(v), leg: ["50%", "100%", "≥160%"] },
  razao16: { label: "mi_razao16", val: (m) => m.razao_16mais, div: [0.6, 1.0, 2.0], fmt: (v) => PCT(v), leg: ["60%", "100%", "≥200%"] },
  idoso:   { label: "mi_idoso", val: (m) => m.pct_70mais, seq: [0, 0.20], fmt: (v) => PCT(v), leg: ["0%", "≥20%"] },
  escol:   { label: "mi_escol", val: (m) => m.pct_ate_fundamental, seq: [0.2, 0.8], fmt: (v) => PCT(v), leg: ["20%", "≥80%"] },
  saldo:   { label: "mi_saldo", val: (m) => (m.eleitores ? m.transferencias_saldo / m.eleitores : null), div: [-0.05, 0, 0.05], fmt: (v) => sig(v == null ? null : v * 100), leg: ["−5%", "0", "+5%"] },
  cresc:   { label: "mi_cresc", val: (m) => (m.crescimento_pop_pct != null ? m.crescimento_pop_pct / 100 : null), div: [-0.01, 0, 0.01], fmt: (v) => sig(v == null ? null : v * 100), leg: ["−1%", "0", "+1%"] },
  abst24:  { label: "mi_abst24", val: (m) => (m.comparecimento && m.comparecimento["2024"] ? m.comparecimento["2024"].abst_pct : null), seq: [0, 0.4], fmt: (v) => PCT(v), leg: ["0%", "≥40%"] },
  abst22:  { label: "mi_abst22", val: (m) => (m.comparecimento && m.comparecimento["2022"] ? m.comparecimento["2022"].abst_pct : null), seq: [0, 0.4], fmt: (v) => PCT(v), leg: ["0%", "≥40%"] },
  gasto:   { label: "mi_gasto", val: (m) => (m.contas ? m.contas.despesa_por_eleitor : null), seq: [10, 90], fmt: (v) => (v == null ? "—" : BRL2.format(v)), leg: ["≤R$ 10", "≥R$ 90"] },
  orcsaude:{ label: "mi_orc_saude", val: (m) => (m.orcamento && m.orcamento.saude != null && m.orcamento.despesa) ? m.orcamento.saude / m.orcamento.despesa : null, seq: [0.15, 0.32], fmt: (v) => PCT(v), leg: ["≤15%", "≥32%"] },
  orceduc: { label: "mi_orc_educ", val: (m) => (m.orcamento && m.orcamento.educacao != null && m.orcamento.despesa) ? m.orcamento.educacao / m.orcamento.despesa : null, seq: [0.18, 0.42], fmt: (v) => PCT(v), leg: ["≤18%", "≥42%"] },
  bn:      { label: "mi_bn", val: (m) => (m.eleicao2024 ? m.eleicao2024.pct_brancos_nulos : null), seq: [0.02, 0.10], fmt: (v) => PCT(v), leg: ["≤2%", "≥10%"] },
  espectro:{ label: "mi_espectro", cat: true, val: (m) => (m.eleicao2024 ? m.eleicao2024.espectro : null), colors: ESP_COR, fmt: (v) => (v ? t(ESP_KEY[v]) : "—") },
  espectro_gov:{ label: "mi_espectro_gov", cat: true, val: (m) => (DADOS.governadores && DADOS.governadores[m.uf]) ? DADOS.governadores[m.uf].espectro : null, colors: ESP_COR, fmt: (v) => (v ? t(ESP_KEY[v]) : "—") },
};
const _lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const DIV_LO = [56, 135, 255], DIV_MID = [232, 236, 245], DIV_HI = [255, 77, 61];
function corDiv(t) {
  t = Math.max(0, Math.min(1, t));
  return t <= 0.5 ? `rgb(${_lerp(DIV_LO, DIV_MID, t / 0.5).join(",")})` : `rgb(${_lerp(DIV_MID, DIV_HI, (t - 0.5) / 0.5).join(",")})`;
}
function corInd(ind, v) {
  const semdado = temaClaro() ? "#d4dae3" : "#262b36";
  if (ind.cat) return (v != null && ind.colors[v]) ? ind.colors[v] : semdado;
  if (v == null) return semdado;   // sem dado
  if (ind.div) { const [lo, mid, hi] = ind.div; const t = v <= mid ? 0.5 * (v - lo) / (mid - lo) : 0.5 + 0.5 * (v - mid) / (hi - mid); return corDiv(t); }
  const [mn, mx] = ind.seq; return cor(Math.max(0, Math.min(1, (v - mn) / (mx - mn))));
}
const _pad = (f) => String(f.properties.codarea).padStart(2, "0");
function ufAggMap(ind) {
  const g = {}; LINHAS.forEach((m) => { const v = ind.val(m); if (v != null) (g[m.uf] || (g[m.uf] = [])).push(v); });
  const out = {};
  for (const uf in g) {
    if (ind.cat) {                       // categórico: moda (espectro mais frequente na UF)
      const c = {}; g[uf].forEach((x) => { c[x] = (c[x] || 0) + 1; });
      out[uf] = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
    } else out[uf] = mediana(g[uf]);
  }
  return out;
}
const DEST_PREDS = {
  cem: (m) => m.mais_eleitores_que_pop,
  atip: (m) => m.outlier_nacional,
  marg: (m) => m.eleicao2024 && m.eleicao2024.entrada_maior_que_margem,
  rev3: (m) => m.revisao && m.revisao.atende_3,
  t2: (m) => m.eleicao2024 && m.eleicao2024.turno === "2",
};
const DEST_LABELS = { cem: "map_f_cem", atip: "map_f_atip", marg: "map_f_marg", rev3: "map_f_rev3", t2: "map_f_t2" };
function matchDestaque(m) {
  if (!m) return false;
  if (destaque === "todos") return true;
  const p = DEST_PREDS[destaque];
  return p ? !!p(m) : true;
}
function styleUF(f) { const ind = MAP_INDS[mapInd]; return { fillColor: corInd(ind, UF_AGG[codToSigla[_pad(f)]]), fillOpacity: 0.88, color: "#0a0b10", weight: 1 }; }
function styleMun(f) {
  const ind = MAP_INDS[mapInd], m = munById.get(String(f.properties.codarea));
  return { fillColor: corInd(ind, m ? ind.val(m) : null), fillOpacity: matchDestaque(m) ? 0.92 : 0.06, color: "#0a0b10", weight: 0.4 };
}
function popupHTML(m) {
  const cel = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  return `<div class="mapa-pop"><div class="pp-tit">${m.nome}-${m.uf}</div>
    <div class="pp-grid">
      ${cel(PCT(m.razao_total), t("pp_razao"))}${cel(PCT(m.razao_16mais), t("pp_razao16"))}
      ${cel(fmt(m.eleitores), t("pp_eleitores"))}${cel(fmt(m.pop_total_estimada), t("pp_pop", { ano: DADOS.ano_populacao }))}
      ${m.transferencias_saldo != null ? cel(sig0(m.transferencias_saldo), t("pp_saldo")) : ""}
      ${m._abst != null ? cel(PCT(m._abst), t("pp_abstencao")) : ""}
      ${cel("#" + (m._rankNac || "—"), t("pp_pais"))}
    </div>
    ${badges(m) === "—" ? "" : `<div class="pp-badges">${badges(m)}</div>`}
    <button class="pp-btn" onclick="abrirCidadeCod('${m.cd_ibge}')">${t("pp_ver")}</button>
  </div>`;
}
function abrirCidadeCod(cd) { if (MAP) MAP.closePopup(); const m = munById.get(cd); if (m) abrirCidade(m); }

function initMapa() {
  if (typeof L === "undefined") { document.getElementById("mapaBloco").style.display = "none"; return; }
  for (const uf in DADOS.uf_codigos) codToSigla[DADOS.uf_codigos[uf]] = uf;
  munById = new Map(LINHAS.map((m) => [m.cd_ibge, m]));

  MAP = L.map("mapa", {
    zoomControl: true, attributionControl: false,
    scrollWheelZoom: true, wheelPxPerZoomLevel: 90,
    zoomSnap: 0.25, zoomDelta: 0.5,
  });

  munLayer = L.geoJSON(null, {
    style: styleMun,
    onEachFeature: (f, lyr) => {
      const m = munById.get(String(f.properties.codarea));
      if (!m) return;
      lyr.bindPopup(popupHTML(m), { maxWidth: 260 });
      lyr.on("mouseover", () => { lyr.setStyle({ weight: 1.6, color: temaClaro() ? "#111827" : "#fff", fillOpacity: 1 }); lyr.bringToFront(); });
      lyr.on("mouseout", () => munLayer.resetStyle(lyr));
    },
  }).addTo(MAP);

  MAP.on("moveend", atualizarDetalhe);

  fetch("data/malha/uf.json", { cache: "force-cache" }).then((r) => r.json()).then((gj) => {
    UF_GEO = gj.features;
    UF_AGG = ufAggMap(MAP_INDS[mapInd]);
    ufLayer = L.geoJSON(gj, {
      style: styleUF,
      onEachFeature: (f, lyr) => {
        const sg = codToSigla[_pad(f)];
        lyr.bindTooltip(`<b>${sg}</b> · ${t(MAP_INDS[mapInd].label).toLowerCase()} ${MAP_INDS[mapInd].fmt(UF_AGG[sg])}`, { sticky: true });
        lyr.on("mouseover", () => { lyr.setStyle({ weight: 2.5, color: temaClaro() ? "#111827" : "#fff", fillOpacity: 1 }); lyr.bringToFront(); });
        lyr.on("mouseout", () => ufLayer.resetStyle(lyr));
        lyr.on("click", () => zoomParaUF(_pad(f), sg));
      },
    }).addTo(MAP);
    ufLayer.bringToBack();

    const b = ufLayer.getBounds();
    zBrasil = MAP.getBoundsZoom(b, false, L.point(10, 10));
    Z_MUNI = zBrasil + 1.0;
    Z_LABEL = zBrasil + 3.0;
    MAP.setMinZoom(zBrasil);
    MAP.setMaxBounds(b.pad(0.35));
    MAP.fitBounds(b, { padding: [10, 10] });
    legend();
  });
}

// Troca o indicador / o destaque e recolore as duas camadas.
function recolorMapa() {
  const ind = MAP_INDS[mapInd];
  UF_AGG = ufAggMap(ind);
  if (ufLayer) {
    ufLayer.setStyle(styleUF);
    ufLayer.eachLayer((l) => l.setTooltipContent(`<b>${codToSigla[_pad(l.feature)]}</b> · ${t(ind.label).toLowerCase()} ${ind.fmt(UF_AGG[codToSigla[_pad(l.feature)]])}`));
  }
  if (munLayer) munLayer.setStyle(styleMun);
  legend();
}

// Carrega/descarta os municípios conforme o zoom e a área visível.
function atualizarDetalhe() {
  if (!ufLayer) return;
  const z = MAP.getZoom(), bounds = MAP.getBounds();
  if (z >= Z_MUNI) {
    ufLayer.eachLayer((uf) => {
      const cod = String(uf.feature.properties.codarea).padStart(2, "0");
      if (!loadedUFs.has(cod) && bounds.intersects(uf.getBounds())) {
        loadedUFs.add(cod);
        fetch(`data/malha/mun_${cod}.json`, { cache: "force-cache" })
          .then((r) => r.json())
          .then((gj) => { munLayer.addData(gj); atualizarRotulos(); })
          .catch(() => loadedUFs.delete(cod));
      }
    });
    document.getElementById("mapaDica").textContent =
      z >= Z_LABEL ? t("map_dica_click") : t("map_dica_zoom");
  } else if (loadedUFs.size) {       // zoom-out: limpa para aliviar e voltar ao mapa de UFs
    munLayer.clearLayers(); loadedUFs.clear(); labeled = new Set();
    document.getElementById("mapaDica").textContent = t("map_dica_default");
  }
  document.getElementById("mapaVoltar").hidden = z <= zBrasil + 0.05;
  atualizarRotulos();
}

// Mostra os nomes das cidades visíveis (com teto, pra não poluir).
function atualizarRotulos() {
  if (MAP.getZoom() < Z_LABEL) { labeled.forEach((l) => l.closeTooltip()); labeled = new Set(); return; }
  const bounds = MAP.getBounds(), keep = new Set();
  let n = 0;
  munLayer.eachLayer((l) => {
    if (n >= 140) return;
    if (!bounds.contains(l.getBounds().getCenter())) return;
    const m = munById.get(String(l.feature.properties.codarea));
    if (!m) return;
    if (!l.getTooltip()) l.bindTooltip(m.nome, { permanent: true, direction: "center", className: "city-label" });
    l.openTooltip(); keep.add(l); n++;
  });
  labeled.forEach((l) => { if (!keep.has(l)) l.closeTooltip(); });
  labeled = keep;
}

function zoomParaUF(cod, sg) {
  setUF(sg);
  const alvo = [];
  ufLayer.eachLayer((uf) => { if (String(uf.feature.properties.codarea).padStart(2, "0") === cod) alvo.push(uf); });
  if (alvo.length) MAP.flyToBounds(alvo[0].getBounds(), { padding: [20, 20], duration: 0.6 });
  document.getElementById("mapaVoltar").hidden = false;
}

function voltarBrasil() {
  munLayer.clearLayers(); loadedUFs.clear(); labeled = new Set();
  setUF("");
  document.getElementById("mapaVoltar").hidden = true;
  document.getElementById("mapaDica").textContent = t("map_dica_default");
  if (ufLayer) MAP.flyToBounds(ufLayer.getBounds(), { padding: [10, 10], duration: 0.6 });
}

function legend() {
  const ind = MAP_INDS[mapInd];
  const realceTxt = destaque === "todos" ? "" : ` · ${t("leg_realcando", { q: t(DEST_LABELS[destaque] || "map_f_todos") })}`;
  if (ind.cat) {
    const sw = Object.keys(ind.colors).map((k) => `<span><span class="sw" style="background:${ind.colors[k]}"></span>${t(ESP_KEY[k] || k)}</span>`).join(" ");
    document.getElementById("mapaLegenda").innerHTML = `${sw} &nbsp;·&nbsp; <b>${t(ind.label)}</b>${realceTxt}`;
    return;
  }
  const grad = ind.div
    ? "linear-gradient(90deg, rgb(56,135,255), rgb(232,236,245), rgb(255,77,61))"
    : "linear-gradient(90deg,#1d3b4a,#46e0c0,#ffd23f,#ff7b3d)";
  const fim = ind.div ? ind.leg[2] : ind.leg[1];
  const pivo = ind.div ? ` · ${t("leg_vira")} <b>${ind.leg[1]}</b>` : "";
  const realce = destaque === "todos" ? "" : ` · ${t("leg_realcando", { q: t(DEST_LABELS[destaque] || "map_f_todos") })}`;
  document.getElementById("mapaLegenda").innerHTML =
    `<span>${ind.leg[0]}</span><span class="grad" style="background:${grad}"></span><span>${fim}</span>` +
    ` &nbsp;·&nbsp; <b>${t(ind.label)}</b>${pivo}${realce}`;
}

/* ---------------- TABELA ---------------- */
function preencherUFs(ufs) {
  document.querySelectorAll("select.uf-sync").forEach((sel) => {
    ufs.forEach((u) => { const o = document.createElement("option"); o.value = u; o.textContent = u; sel.appendChild(o); });
  });
}
// filtro de UF unificado: sincroniza todos os seletores e re-renderiza tabela,
// ranking e histograma (assim o filtro vale "em todo lugar", de forma consistente).
function setUF(uf) {
  ufSel = uf || "";
  document.querySelectorAll("select.uf-sync").forEach((s) => { if (s.value !== ufSel) s.value = ufSel; });
  render(); renderRanking(); renderHistograma();
}

function badges(m) {
  const limBR = DADOS.limiar_estatistico_nacional;
  const _ti = (k) => t(k).replace(/<[^>]+>/g, "").replace(/"/g, "&quot;");
  let s = "";
  if (m.mais_eleitores_que_pop) s += `<span class="badge b100" title="${_ti("bdg_100_t")}">${t("bdg_100")}</span>`;
  if (m.acima_limiar_tse) s += `<span class="badge btse" title="${_ti("bdg_80_t")}">${t("bdg_80")}</span>`;
  if (m.outlier_nacional) s += `<span class="badge bnac" title="${t("bdg_atip_t", { lim: PCT(limBR) }).replace(/"/g, "&quot;")}">${t("bdg_atip")}</span>`;
  return s || "—";
}
const temFlag = (m) => m.mais_eleitores_que_pop || m.acima_limiar_tse || m.outlier_nacional || m.outlier_uf;

// predicados dos chips (booleanos simples no município OU campos aninhados/derivados)
const CHIP_PREDS = {
  mais_eleitores_que_pop: (m) => m.mais_eleitores_que_pop,
  acima_limiar_tse: (m) => m.acima_limiar_tse,
  outlier_nacional: (m) => m.outlier_nacional,
  entrada_margem: (m) => m.eleicao2024 && m.eleicao2024.entrada_maior_que_margem,
  rev3: (m) => m.revisao && m.revisao.atende_3,
  turno2: (m) => m.eleicao2024 && m.eleicao2024.turno === "2",
};
function filtrar() {
  return LINHAS.filter((m) => {
    if (ufSel && m.uf !== ufSel) return false;
    if (busca && !m.nome.toLowerCase().includes(busca)) return false;
    for (const f of flagsAtivas) { const p = CHIP_PREDS[f]; if (p ? !p(m) : !m[f]) return false; }
    return true;
  });
}
// acessores p/ ordenar por indicadores NOVOS (aninhados/derivados), além das colunas
const ORD_ACC = {
  o_abst: (m) => m._abst,
  o_bn: (m) => (m.eleicao2024 ? m.eleicao2024.pct_brancos_nulos : null),
  o_gasto: (m) => (m.contas ? m.contas.despesa_por_eleitor : null),
  o_receita_camp: (m) => (m.contas ? m.contas.receita_total : null),
  o_orc_hab: (m) => (m.orcamento && m.orcamento.despesa && m.pop_total_estimada) ? m.orcamento.despesa / m.pop_total_estimada : null,
  o_orc_saude: (m) => (m.orcamento && m.orcamento.saude != null && m.orcamento.despesa) ? m.orcamento.saude / m.orcamento.despesa : null,
  o_orc_educ: (m) => (m.orcamento && m.orcamento.educacao != null && m.orcamento.despesa) ? m.orcamento.educacao / m.orcamento.despesa : null,
};
const ORD_FMT = {
  o_abst: PCT, o_bn: PCT, o_orc_saude: PCT, o_orc_educ: PCT,
  o_gasto: (v) => BRL2.format(v), o_receita_camp: (v) => moeda(v), o_orc_hab: (v) => BRL0.format(v),
};
function ordenar(linhas) {
  const k = ordenarPor;
  const acc = ORD_ACC[k];
  return linhas.slice().sort((a, b) => {
    if (!acc && (k === "nome" || k === "uf")) return ordemDesc ? String(b[k]).localeCompare(a[k]) : String(a[k]).localeCompare(b[k]);
    let va = acc ? acc(a) : a[k], vb = acc ? acc(b) : b[k];
    va = va == null ? -Infinity : va; vb = vb == null ? -Infinity : vb;
    return ordemDesc ? vb - va : va - vb;
  });
}
function render() {
  const todas = ordenar(filtrar());
  const linhas = todas.slice(0, LIMITE_LINHAS);
  const accOrd = ORD_ACC[ordenarPor], fmtOrd = ORD_FMT[ordenarPor] || fmt;
  document.getElementById("corpo").innerHTML = linhas.map((m) => {
    const forte = m.razao_total != null && m.razao_total > 1 ? "razao-forte" : "";
    const ov = accOrd ? accOrd(m) : null;
    const ovTxt = (accOrd && ov != null) ? ` <small class="ordv">${fmtOrd(ov)}</small>` : "";
    return `<tr class="clicavel" data-cd="${m.cd_ibge}">
        <td class="nome">${m.nome}${ovTxt}</td><td>${m.uf}</td>
        <td class="num">${fmt(m.eleitores)}</td>
        <td class="num">${fmt(m.pop_total_estimada)}</td>
        <td class="num ${forte}">${PCT(m.razao_total)}</td>
        <td class="num">${PCT(m.razao_16mais)}</td>
        <td class="mk">${badges(m)}</td>
      </tr>`;
  }).join("");

  const trunc = todas.length > LIMITE_LINHAS ? t("tbl_trunc", { n: fmt(LIMITE_LINHAS) }) : "";
  document.getElementById("contagem").textContent = t("tbl_contagem", { x: fmt(todas.length), y: fmt(LINHAS.length), trunc });
  document.querySelectorAll("th[data-k]").forEach((th) => {
    th.removeAttribute("aria-sort");
    if (th.dataset.k === ordenarPor) th.setAttribute("aria-sort", ordemDesc ? "descending" : "ascending");
  });
}

/* ---------------- EVENTOS ---------------- */
function bind() {
  document.getElementById("busca").addEventListener("input", (e) => { busca = e.target.value.trim().toLowerCase(); render(); });
  document.querySelectorAll("select.uf-sync").forEach((s) =>
    s.addEventListener("change", (e) => setUF(e.target.value)));
  const ordSel = document.getElementById("ordcampo");
  if (ordSel) ordSel.addEventListener("change", (e) => {
    ordenarPor = e.target.value || "razao_total"; ordemDesc = true; render();
  });
  const histSel = document.getElementById("histInd");
  if (histSel) histSel.addEventListener("change", (e) => { histInd = e.target.value; renderHistograma(); });
  document.getElementById("mapaInd").addEventListener("change", (e) => { mapInd = e.target.value; recolorMapa(); });
  document.querySelectorAll("#mapaFiltro button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mapaFiltro button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on"); destaque = b.dataset.f; recolorMapa();
  }));
  document.getElementById("mapaVoltar").addEventListener("click", voltarBrasil);
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      const f = c.dataset.flag;
      if (flagsAtivas.has(f)) { flagsAtivas.delete(f); c.setAttribute("aria-pressed", "false"); }
      else { flagsAtivas.add(f); c.setAttribute("aria-pressed", "true"); }
      render();
    });
  });
  document.querySelectorAll("th[data-k]").forEach((th) => {
    if (th.dataset.k === "_flags") return;
    th.addEventListener("click", () => {
      const k = th.dataset.k;
      if (k === ordenarPor) ordemDesc = !ordemDesc;
      else { ordenarPor = k; ordemDesc = k !== "nome" && k !== "uf"; }
      render();
    });
  });
  document.getElementById("corpo").addEventListener("click", (e) => {
    const tr = e.target.closest("tr.clicavel"); if (!tr) return;
    const m = munById && munById.get(tr.dataset.cd);
    if (m) abrirCidade(m);
  });
  document.getElementById("btnExplorar").addEventListener("click", () =>
    document.getElementById("explorar").scrollIntoView({ behavior: "smooth" }));
  document.getElementById("btnShare").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title: document.title, url }); return; }
      await navigator.clipboard.writeText(url); toast();
    } catch (_) { /* cancelado */ }
  });
}
let _toastT = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg || t("toast_copied");
  el.hidden = false;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { el.hidden = true; }, 2200);
}

function renderFontes() {
  if (!META) return;
  const fontes = META.fontes || [];
  // agrupa por órgão e condensa famílias (as 28 malhas viram 1, anos juntos)
  const grupos = {};   // orgao -> { base -> Set(anos) }
  fontes.forEach((f) => {
    const org = (f.publisher || "").replace(/\s*—.*/, "").trim() || t("font_fonte");
    let base;
    if (/Malha/i.test(f.dataset)) base = t("font_malhas");
    else if (/Códigos oficiais/i.test(f.dataset)) base = t("font_crosswalk");
    else base = f.dataset.replace(/\s*[-–]\s*\d{4}\s*$/, "").replace(/^IBGE\s+/, "").trim();
    const g = grupos[org] || (grupos[org] = {});
    const anos = g[base] || (g[base] = new Set());
    const ano = (/^\d{4}$/.test(f.periodo) ? f.periodo : (f.dataset.match(/[-–]\s*(\d{4})\s*$/) || [])[1]);
    if (ano) anos.add(ano);
  });
  let html = "";
  for (const org in grupos) {
    const itens = Object.entries(grupos[org]).map(([base, anos]) => {
      const a = [...anos].sort();
      return `<li>${base}${a.length ? ` <span class="quando">(${a.join(", ")})</span>` : ""}</li>`;
    }).join("");
    html += `<div class="fonte-grp"><b>${org}</b><ul>${itens}</ul></div>`;
  }
  const data = fontes.map((f) => f.extraido_em).filter(Boolean).sort().pop() || "";
  html += `<p class="fonte-nota">${t("font_extraido", { data: data.replace("T", " ").slice(0, 16) })}</p>`;
  document.getElementById("fontes").innerHTML = html;
  document.getElementById("metanota").textContent = t("metanota_metodo");
}

carregar().catch((e) => {
  document.getElementById("lede").textContent = (I18N.pt && I18N.pt.load_err)
    ? t("load_err")
    : "Erro ao carregar os dados. Rode o pipeline (python -m eleitoral.build) para gerar docs/data/brasil.json.";
  console.error(e);
});
