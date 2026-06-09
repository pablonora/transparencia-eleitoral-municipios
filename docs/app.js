"use strict";

// Versão dos assets servidos pelo Pages (bump junto com ?v= de app.js/style.css no
// index.html). Usada para versionar fetch de i18n → permite cache imutável (a URL
// muda quando o conteúdo muda), em vez de re-baixar a cada visita.
const ASSET_V = "20260609a";

// Métricas de interação: eventos custom do GoatCounter. No-op quando o count.js
// não carregou (localhost / Do Not Track → window.goatcounter ausente). Nunca lança,
// para nunca quebrar a UI por causa de uma métrica. Dados agregados, sem PII.
function track(nome) {
  try {
    if (window.goatcounter && typeof window.goatcounter.count === "function") {
      window.goatcounter.count({ path: "evt-" + nome, title: "evt: " + nome, event: true });
    }
  } catch (_) { /* métrica nunca interrompe a interação */ }
}
// respeita "reduzir movimento" do sistema (a11y) em scrolls/animações de mapa
const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");

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
    track("tema-" + novo);
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
// ISO "2026-06-08T19:32:07Z" → "8 jun 2026" (PT) / "Jun 8, 2026" (EN). Sem Date().
function dataCurta(iso) {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || "";
  const mes = (LANG === "en" ? MESES_EN : MESES_PT)[+m[2] - 1];
  return LANG === "en" ? `${mes} ${+m[3]}, ${m[1]}` : `${+m[3]} ${mes} ${m[1]}`;
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
      fetch(`i18n/pt.json?v=${ASSET_V}`, { cache: "force-cache" }).then((r) => r.json()),
      fetch(`i18n/en.json?v=${ASSET_V}`, { cache: "force-cache" }).then((r) => r.json()),
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
    const v = _tr(el.dataset.i18nTitle);
    if (v != null) {
      const limpo = v.replace(/<[^>]+>/g, "");
      el.title = limpo;
      // botões só-ícone (ex.: ⇄) têm aria-label = título, traduzido junto
      if (el.hasAttribute("aria-label")) el.setAttribute("aria-label", limpo);
    }
  });
}
// Reflete o idioma atual na URL (?lang=), preservando os demais parâmetros. Como
// o Pages é estático, o cartão social (og) servido a scrapers fica em PT; mas o
// link compartilhado carrega ?lang= → quem abrir vê a página já no idioma certo.
function refletirLangNaURL() {
  try {
    const u = new URL(location.href);
    if (u.searchParams.get("lang") === LANG) return;
    u.searchParams.set("lang", LANG);
    history.replaceState(null, "", u);
  } catch (_) {}
}
function aplicarIdioma(lang) {
  LANG = (lang === "en") ? "en" : "pt";
  refmtLocale();
  document.documentElement.lang = (LANG === "en") ? "en-US" : "pt-BR";
  refletirLangNaURL();
  const _ti = _tr("title"); if (_ti) document.title = _ti;
  const _md = _tr("meta_desc");
  const setMeta = (sel, v) => { const el = document.querySelector(sel); if (el && v) el.content = v; };
  setMeta('meta[name="description"]', _md);
  // mantém o cartão social coerente com o idioma da página (scrapers leem o HTML
  // estático em PT, mas isto corrige o que o usuário vê/copia ao alternar idioma)
  setMeta('meta[property="og:title"]', _ti);
  setMeta('meta[property="og:description"]', _md);
  setMeta('meta[name="twitter:title"]', _ti);
  setMeta('meta[name="twitter:description"]', _md);
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
    track("idioma-" + novo);
    try { localStorage.setItem("idioma", novo); } catch (_) {}
  });
}

const LIMITE_LINHAS = 800;
const NCOLS = 10;

let DADOS = null, META = null, LINHAS = [];
// Emendas FEDERAIS (Portal da Transparência) — CARGA SOB DEMANDA, em dois níveis:
//  • RESUMO (totais por município): emendas_resumo.json, leve — alimenta o mapa e a
//    coluna da tabela. ensureEmendasResumo() funde {total,n} em cada município.
//  • GRANULAR por UF: emendas/{uf}.json (lista de emendas com valor por mês) — só é
//    baixado quando o usuário abre uma cidade. Base do filtro de período no card.
// Versionado por meta.emendas_gerado_em (refresh semanal). Nada disso pesa o load.
let EMENDAS_RESUMO = null, _resumoPromise = null;
const _emendasUFP = {};                  // uf -> Promise<{municipios:{cd:...}}>
function _emendasVer() {
  const v = META && META.emendas_gerado_em;
  return v ? `?v=${encodeURIComponent(v)}` : "";
}
function ensureEmendasResumo() {
  if (EMENDAS_RESUMO) return Promise.resolve(EMENDAS_RESUMO);
  if (_resumoPromise) return _resumoPromise;
  const v = _emendasVer();
  _resumoPromise = fetch(`data/emendas_resumo.json${v}`, { cache: v ? "force-cache" : "no-store" })
    .then((r) => r.json())
    .then((j) => {
      EMENDAS_RESUMO = j;
      const mm = (j && j.municipios) || {};
      for (const cd in mm) { const m = munById.get(cd); if (m) m.emendas = mm[cd]; }
      return j;
    })
    .catch(() => { EMENDAS_RESUMO = { municipios: {} }; return EMENDAS_RESUMO; });
  return _resumoPromise;
}
function ensureEmendasUF(uf) {
  if (_emendasUFP[uf]) return _emendasUFP[uf];
  const v = _emendasVer();
  _emendasUFP[uf] = fetch(`data/emendas/${uf}.json${v}`, { cache: v ? "force-cache" : "no-store" })
    .then((r) => r.json())
    .catch(() => ({ municipios: {} }));
  return _emendasUFP[uf];
}
let ordenarPor = "razao_total", ordemDesc = true;
const flagsAtivas = new Set();
let busca = "", ufSel = "", porteSel = "", partidoSel = "";
// snapshot dos parâmetros da URL no carregamento: o primeiro render() já reescreve
// a URL (sync do explorador), então guardamos os params ANTES de qualquer render.
let _urlInicial = null;

async function carregar() {
  _urlInicial = new URLSearchParams(location.search);
  // meta.json é pequeno e sempre buscado fresco (no-store); dele tiramos a "versão"
  // dos dados (gerado_em) para versionar o brasil.json. Assim o JSON grande (~2,4 MB
  // gzip) pode ser cacheado de forma IMUTÁVEL: instantâneo em revisitas e re-baixado
  // só quando o pipeline regenera (a URL muda). Sem versão (meta indisponível),
  // cai no comportamento antigo (no-store).
  const b = await fetch("data/meta.json", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  const ver = (b && b.gerado_em) ? encodeURIComponent(b.gerado_em) : "";
  const dataURL = ver ? `data/brasil.json?v=${ver}` : "data/brasil.json";
  const [a] = await Promise.all([
    fetch(dataURL, { cache: ver ? "force-cache" : "no-store" }).then((r) => r.json()),
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
  preencherPartidos();
  preencherColInd();
  renderFontes();
  bind();
  restaurarExploradorDaURL();   // aplica UF/busca/ordenação/marcadores/mapa da URL
  render();
  renderRanking();              // re-render com a UF eventualmente restaurada
  renderHistograma();
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
    eleitcresc: {
      titulo: t("rank_t_eleitcresc"),
      val: crescEleit,
      fmt: (v) => sig(v == null ? null : v * 100),
    },
  };
}
function renderRanking() {
  const def = rankDefs()[rankAtual];
  let pool = LINHAS.filter((m) => def.val(m) != null);
  if (ufSel) pool = pool.filter((m) => m.uf === ufSel);
  pool.sort((a, b) => def.asc ? def.val(a) - def.val(b) : def.val(b) - def.val(a));
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
  const tabs = [...document.querySelectorAll("#rankTabs .tab")];
  const selecionar = (tab) => {
    tabs.forEach((x) => {
      const on = x === tab;
      x.classList.toggle("on", on);
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.setAttribute("tabindex", on ? "0" : "-1");   // roving tabindex
    });
    rankAtual = tab.dataset.rk; renderRanking();
  };
  tabs.forEach((tab, i) => {
    const on = tab.classList.contains("on");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", on ? "true" : "false");
    tab.setAttribute("tabindex", on ? "0" : "-1");
    tab.addEventListener("click", () => selecionar(tab));
    tab.addEventListener("keydown", (e) => {
      let j = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      if (j === null) return;
      e.preventDefault(); tabs[j].focus(); selecionar(tabs[j]);
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
// Evolução do TAMANHO do eleitorado ao longo das eleições (2014→2024): eleitorado
// APTO (QT_APTOS) em cada pleito, do TSE — definição consistente entre os pontos.
function eleitoradoEvolBlock(m) {
  const s = m.eleitorado_serie;
  if (!s || s.length < 2) return "";
  const max = Math.max(...s.map((p) => p.aptos)) || 1;
  const first = s[0].aptos, last = s[s.length - 1].aptos;
  const cresc = first ? ((last - first) / first) * 100 : null;
  const barras = s.map((p) => `<div class="evo-item">
      <div class="evo-track"><div class="evo-bar" style="height:${Math.max(5, (p.aptos / max) * 100)}%"></div></div>
      <div class="evo-v">${fmt(p.aptos)}</div><div class="evo-l">${p.ano}</div>
    </div>`).join("");
  const varLinha = (cresc != null)
    ? `<div class="evo-var ${cresc >= 0 ? "up" : "down"}">${t("evo_var", { pct: sig(cresc), de: s[0].ano, ate: s[s.length - 1].ano })}</div>` : "";
  return `<div class="comp-blk"><div class="cb-tit">${t("evo_tit")}</div>
    <div class="evo-chart">${barras}</div>
    ${varLinha}
    <div class="cb-fonte">${t("evo_nota")}</div>
  </div>`;
}
// Tendência da abstenção em cada eleição (2014→2024), do TSE. Mesma fonte da série
// do eleitorado; barras âmbar (abstenção = metade "alerta" da participação).
function abstencaoEvolBlock(m) {
  const s = m.abstencao_serie;
  if (!s || s.length < 2) return "";
  const max = Math.max(...s.map((p) => p.abst_pct)) || 1;
  const barras = s.map((p) => `<div class="evo-item">
      <div class="evo-track"><div class="evo-bar" style="height:${Math.max(5, (p.abst_pct / max) * 100)}%;background:linear-gradient(180deg,#e8833a,#7a3a12)"></div></div>
      <div class="evo-v">${PCT0(p.abst_pct)}</div><div class="evo-l">${p.ano}</div>
    </div>`).join("");
  return `<div class="comp-blk"><div class="cb-tit">${t("abst_evo_tit")}</div>
    <div class="evo-chart">${barras}</div>
    <div class="cb-fonte">${t("abst_evo_nota")}</div>
  </div>`;
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
  const part = e.partido ? `<div class="cb-row"><span class="cb-ano">${t("el_partido")}</span><b>${e.partido}</b></div>` : "";
  return `<div class="comp-blk"><div class="cb-tit">${t("el_tit", { turno })}</div>
    <div class="cb-row"><span class="cb-ano">${t("el_vencedor")}</span><b>${e.vencedor}</b> · ${fmt(e.votos_venc)} ${t("el_votos_suf")}</div>
    ${part}
    <div class="cb-row"><span class="cb-ano">${t("el_margem_lab")}</span><b>${fmt(e.margem)}</b> ${t("el_votos_suf")}</div>
    ${bn}
    ${cruz}</div>`;
}
function govBlock(m) {
  const g = DADOS.governadores && DADOS.governadores[m.uf];
  const e = DADOS.estados && DADOS.estados[m.uf];
  if (!g && !e) return "";
  let html = `<div class="comp-blk"><div class="cb-tit">${t("gov_tit", { uf: m.uf })}</div>`;
  if (g) html += `<div class="cb-row"><span class="cb-ano">${t("el_governador")}</span><b>${g.governador}</b> · ${g.partido}</div>`;
  if (e) {
    const pop = e.populacao;
    const pcap = (v) => (v != null && pop ? `${BRL0.format(v / pop)}${t("orc_hab")}` : "");
    const pctd = (v) => (v != null && e.despesa ? PCT(v / e.despesa) : "");
    const linha = (lab, v) => v == null ? "" :
      `<div class="cb-row"><span class="cb-ano">${lab}</span>${moeda(v)} <small>${[pctd(v), pcap(v)].filter(Boolean).join(" · ")}</small></div>`;
    const funcoes = [
      linha(t("orc_saude"), e.saude), linha(t("orc_educacao"), e.educacao),
      linha(t("orc_seguranca"), e.seguranca), linha(t("orc_assistencia"), e.assistencia),
      linha(t("orc_urbanismo"), e.urbanismo),
    ].filter(Boolean).join("");
    if (e.despesa != null) {
      html += `<div class="cb-row"><span class="cb-ano">${t("orc_estado_despesa")}</span><b>${moeda(e.despesa)}</b>${pop ? ` <small>(${BRL0.format(e.despesa / pop)}${t("orc_hab")})</small>` : ""}</div>`;
    }
    if (funcoes) html += `<div class="cb-subhead">${t("orc_subhead_funcao")}</div>${funcoes}`;
    if (e.pessoal != null) {
      html += `<div class="cb-subhead">${t("orc_subhead_tipo")}</div>
        <div class="cb-row"><span class="cb-ano">${t("orc_pessoal")}</span>${moeda(e.pessoal)}${pcap(e.pessoal) ? ` <small>${pcap(e.pessoal)}</small>` : ""}</div>`;
    }
    html += `<div class="cb-fonte">${t("orc_estado_nota")}</div>`;
  }
  return html + `</div>`;
}
function contasBlock(m) {
  const c = m.contas;
  if (!c) return "";
  const dpe = c.despesa_por_eleitor != null ? ` <small>(${t("ct_por_eleitor", { v: BRL2.format(c.despesa_por_eleitor) })})</small>` : "";
  // por cargo: total gasto + médias por candidato (gasto e arrecadação)
  const medias = (desp, rec, n) => {
    if (!n) return "";
    const partes = [t("ct_cand_n", { n: fmt(n) })];
    if (desp != null) partes.push(t("ct_media_gasto", { v: moeda(desp / n) }));
    if (rec != null) partes.push(t("ct_media_arrec", { v: moeda(rec / n) }));
    return ` <small>(${partes.join(" · ")})</small>`;
  };
  return `<div class="comp-blk"><div class="cb-tit">${t("ct_tit", { ano: DADOS.ano_contas })}</div>
    <div class="cb-row"><span class="cb-ano">${t("ct_arrecadado")}</span><b>${moeda(c.receita_total)}</b></div>
    <div class="cb-row"><span class="cb-ano">${t("ct_gasto")}</span><b>${moeda(c.despesa_total)}</b>${dpe}</div>
    <div class="cb-row"><span class="cb-ano">${t("ct_prefeito")}</span>${moeda(c.despesa_prefeito)}${medias(c.despesa_prefeito, c.receita_prefeito, c.n_cand_prefeito)}</div>
    <div class="cb-row"><span class="cb-ano">${t("ct_vereadores")}</span>${moeda(c.despesa_vereador)}${medias(c.despesa_vereador, c.receita_vereador, c.n_cand_vereador)}</div>
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
  // POR FUNÇÃO (para onde vai): saúde, educação… — repartem a despesa total.
  const funcoes = [
    linha(t("orc_saude"), o.saude),
    linha(t("orc_educacao"), o.educacao),
    linha(t("orc_seguranca"), o.seguranca),
    linha(t("orc_assistencia"), o.assistencia),
    linha(t("orc_urbanismo"), o.urbanismo),
  ].filter(Boolean).join("");
  // POR TIPO (que tipo de gasto): pessoal ATRAVESSA todas as funções — recorte
  // diferente da MESMA despesa, NÃO soma com as funções. Por isso bloco separado.
  const pessoal = o.pessoal == null ? "" :
    `<div class="cb-subhead">${t("orc_subhead_tipo")}</div>
     <div class="cb-row"><span class="cb-ano">${t("orc_pessoal")}</span>${moeda(o.pessoal)}${pcap(o.pessoal) ? ` <small>${pcap(o.pessoal)}</small>` : ""}</div>
     <div class="cb-fonte">${t("orc_pessoal_nota")}</div>`;
  return `<div class="comp-blk"><div class="cb-tit">${t("orc_tit", { ano: DADOS.ano_orcamento })}</div>
    <div class="cb-row"><span class="cb-ano">${t("orc_receita")}</span><b>${moeda(o.receita)}</b></div>
    <div class="cb-row"><span class="cb-ano">${t("orc_despesa")}</span><b>${moeda(o.despesa)}</b>${pop ? ` <small>(${BRL0.format(o.despesa / pop)}${t("orc_hab")})</small>` : ""}</div>
    ${funcoes ? `<div class="cb-subhead">${t("orc_subhead_funcao")}</div>${funcoes}` : ""}
    ${pessoal}
    <div class="cb-fonte">${t("nota_orcamento")}</div>
  </div>`;
}
// Emendas parlamentares FEDERAIS (Portal da Transparência — Documentos de Despesa):
// TODAS as modalidades (individual, bancada, comissão, relator), atribuídas ao
// município de APLICAÇÃO do recurso. Snapshot semanal (sem tempo real). Tem
// SELETOR DE PERÍODO (ano/mês) que filtra a lista e recalcula os totais.
// Usa window._em = { full, anos, ger } (definido ao abrir a cidade).
function emendasBlock() {
  const E = window._em;
  if (!E || !E.full || !(E.full.emendas || []).length) return "";
  const optAno = `<option value="">${t("em_periodo_todos")}</option>` +
    E.anos.map((a) => `<option value="${a}">${a}</option>`).join("");
  const meses = LANG === "en" ? MESES_EN : MESES_PT;
  const optMes = `<option value="">${t("em_periodo_meses")}</option>` +
    meses.map((nm, i) => `<option value="${String(i + 1).padStart(2, "0")}">${nm}</option>`).join("");
  const ger = E.ger ? `<div class="cb-fonte">${t("em_snapshot_em", { data: dataCurta(E.ger) })}</div>` : "";
  return `<div class="comp-blk" id="pf-emendas">
    <div class="cb-tit">${t("em_tit")}</div>
    <div class="cb-aviso">${t("em_aviso")}</div>
    <div class="em-periodo"><span class="em-periodo-lab">${t("em_periodo")}</span>
      <select id="em-ano" class="em-sel">${optAno}</select>
      <select id="em-mes" class="em-sel" disabled>${optMes}</select>
    </div>
    <div id="em-conteudo"></div>
    ${ger}
    <div class="cb-fonte">${t("nota_emendas")}</div>
  </div>`;
}
const _MOD_EN = { "Individual": "Individual", "Bancada": "Caucus", "Comissão": "Committee", "Relator": "Rapporteur", "Outras": "Other" };
function modLabel(v) { return LANG === "en" ? (_MOD_EN[v] || v) : v; }
// Filtra as emendas pelo período (ano/mês) e re-agrega. Valor = empenhado nos
// meses da janela (o dado granular é por mês).
function emendasNoPeriodo(full, ano, mes) {
  const inWin = (mm) => (!ano || (mm.slice(0, 4) === ano && (!mes || mm.slice(5, 7) === mes)));
  let total = 0, n = 0;
  const porMod = {}, porArea = {}, lista = [];
  for (const e of (full.emendas || [])) {
    let v = 0;
    for (const mm in e.m) if (inWin(mm)) v += e.m[mm];
    if (v <= 0) continue;
    n++; total += v;
    porMod[e.t] = (porMod[e.t] || 0) + v;
    porArea[e.f] = (porArea[e.f] || 0) + v;
    lista.push({ a: e.a, c: e.c, t: e.t, f: e.f, v: v });
  }
  lista.sort((a, b) => b.v - a.v);
  return { total, n, porMod, porArea, lista };
}
function renderEmendasConteudo(ano, mes) {
  const E = window._em; const cont = document.getElementById("em-conteudo");
  if (!E || !cont) return;
  const r = emendasNoPeriodo(E.full, ano, mes);
  const m = window._cidadeAberta, pop = m && m.pop_total_estimada;
  const hab = (v) => (pop ? ` <small>(${BRL0.format(v / pop)}${t("orc_hab")})</small>` : "");
  const mods = Object.entries(r.porMod).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<div class="em-row"><span class="em-quem">${modLabel(k)}</span><span class="em-val">${moeda(v)}</span></div>`).join("");
  const areas = Object.entries(r.porArea).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) =>
    `<div class="em-row"><span class="em-quem">${t("emarea_" + k)}</span><span class="em-val">${moeda(v)}</span></div>`).join("");
  const N = 15;
  const lista = r.lista.slice(0, N).map((e) =>
    `<div class="em-row"><span class="em-quem">${e.a}${casaChip(e.c)}<small class="em-sub">${modLabel(e.t)} · ${t("emarea_" + e.f)}</small></span><span class="em-val">${moeda(e.v)}</span></div>`).join("");
  const mais = r.lista.length > N ? `<div class="cb-fonte">${t("em_mais", { n: r.lista.length - N })}</div>` : "";
  cont.innerHTML =
    `<div class="cb-row"><span class="cb-ano">${t("em_total")}</span><b>${moeda(r.total)}</b>${hab(r.total)}</div>
    <div class="cb-row"><span class="cb-ano">${t("em_n")}</span>${t("em_n_val", { n: fmt(r.n) })}</div>
    ${mods ? `<div class="cb-subhead">${t("em_subhead_mod")}</div>${mods}` : ""}
    ${areas ? `<div class="cb-subhead">${t("em_subhead_area")}</div>${areas}` : ""}
    ${lista ? `<div class="cb-subhead">${t("em_subhead_lista")}</div>${lista}${mais}`
            : `<div class="cb-row" style="color:var(--muted)">${t("em_vazio_periodo")}</div>`}`;
}
// Rótulo traduzível da casa (o dado guarda "Câmara"/"Senado" em PT).
function casaLabel(c) {
  if (c === "Senado") return t("casa_senado");
  if (c === "Câmara") return t("casa_camara");
  return c;
}
// Chip colorido da casa (Câmara = teal, Senado = âmbar). Distingue à vista.
function casaChip(c) {
  if (!c) return "";
  const cls = c === "Senado" ? "senado" : "camara";
  return ` <span class="casa-tag ${cls}">${casaLabel(c)}</span>`;
}
// Placeholder enquanto o emendas.json (carga sob demanda) não chega.
function emendasLoadingHTML() {
  return `<div class="comp-blk"><div class="cb-row cb-loading">${t("em_loading")}</div></div>`;
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
  // foco preso dentro do modal enquanto aberto (a11y: teclado não "escapa" pro fundo)
  document.getElementById("modalCard").addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = focaveis(document.getElementById("modalCard"));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  });
}
// elementos focáveis e visíveis dentro de um container (para o focus-trap do modal)
function focaveis(c) {
  return [...c.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null);
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
  if (btn.disabled) return;                       // ignora cliques repetidos
  btn.disabled = true; btn.textContent = t("geo_localizando");
  // `done` + watchdog garantem que o botão NUNCA fique preso em "Localizando…":
  // alguns navegadores travam o getCurrentPosition sem disparar sucesso NEM erro
  // (mesmo com permissão dada). Se em 8s nada respondeu, liberamos e orientamos a
  // buscar pelo nome. finish() roda uma vez só (evita corrida watchdog × callback).
  let done = false;
  const finish = (after) => {
    if (done) return;
    done = true; clearTimeout(wd);
    btn.disabled = false; btn.textContent = t("geo_btn");
    if (after) after();
  };
  const wd = setTimeout(() => finish(() => toast(t("geo_demorou"))), 8000);
  navigator.geolocation.getCurrentPosition(async (pos) => {
    if (done) return;                             // watchdog já assumiu
    try {
      const m = await cidadePorCoord(pos.coords.latitude, pos.coords.longitude);
      finish(() => { if (m) abrirCidade(m); else toast(t("geo_nao_id")); });
    } catch (_) { finish(() => toast(t("geo_falha"))); }
  }, () => finish(() => toast(t("geo_sem_loc"))),
    { enableHighAccuracy: false, timeout: 7000, maximumAge: 600000 });
}
function fecharModal() {
  document.getElementById("modal").hidden = true;
  window._cidadeAberta = null;
  // devolve o foco a quem abriu o modal (a11y)
  const prev = window._lastFocus;
  window._lastFocus = null;
  if (prev && typeof prev.focus === "function") { try { prev.focus(); } catch (_) {} }
}

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
    ${eleitoradoEvolBlock(m)}
    ${compBlock(m)}
    ${abstencaoEvolBlock(m)}
    ${eleicaoBlock(m)}
    ${govBlock(m)}
    ${contasBlock(m)}
    ${orcamentoBlock(m)}
    <div id="pf-emendas-slot">${emendasLoadingHTML()}</div>
    ${criteriosBlock(m)}
    <p class="frase" style="font-size:.8rem; color:#9aa3b2; margin-top:1rem">${t("nota_neutra")}</p>
    <div class="acts">
      <button class="btn" id="pf-share">${t("city_share")}</button>
      <button class="btn ghost" id="pf-img">${t("city_img")}</button>
      <a class="btn ghost" id="pf-x" target="_blank" rel="noopener">${t("btn_tweet")}</a>
    </div>
  </div>`;
}
// Gera um card PNG (1200×630) com os números da cidade e baixa no navegador
// (sem servidor: canvas → toDataURL → <a download>). Reaproveita as fontes já
// carregadas; em fallback usa sans-serif.
function baixarImagemCidade(m) {
  const W = 1200, H = 630, PAD = 80;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#0b0c11"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#ffd23f"; x.fillRect(0, 0, W, 8);
  x.textBaseline = "alphabetic";
  // eyebrow
  x.fillStyle = "#ffd23f"; x.font = "700 25px Inter, sans-serif";
  try { x.letterSpacing = "2px"; } catch (e) {}
  x.fillText("TRANSPARÊNCIA ELEITORAL · TSE + IBGE", PAD, 92);
  try { x.letterSpacing = "0px"; } catch (e) {}
  // nome + UF (encolhe a fonte se o nome for muito largo)
  let fs = 70;
  x.fillStyle = "#eef1f6"; x.font = `800 ${fs}px Sora, sans-serif`;
  while (x.measureText(m.nome).width > W - PAD * 2 - 90 && fs > 40) { fs -= 4; x.font = `800 ${fs}px Sora, sans-serif`; }
  x.fillText(m.nome, PAD, 168);
  const nw = x.measureText(m.nome).width;
  x.fillStyle = "#9aa3b2"; x.font = "600 34px Inter, sans-serif";
  x.fillText(m.uf, PAD + nw + 18, 168);
  // razão grande
  x.fillStyle = "#ffd23f"; x.font = "800 104px Sora, sans-serif";
  x.fillText(PCT0(m.razao_total), PAD, 290);
  x.fillStyle = "#cfd6e2"; x.font = "500 28px Inter, sans-serif";
  x.fillText(t("city_img_sub"), PAD, 330);
  // células de estatística (até 3)
  const cresc = crescEleit(m);
  const cells = [
    [fmt(m.eleitores), t("city_d_eleitores")],
    cresc != null ? [sig(cresc * 100), t("city_img_cresc")] : [fmt(m.pop_total_estimada), t("city_d_pop", { ano: DADOS.ano_populacao })],
    m._abst != null ? [PCT(m._abst), t("pp_abstencao")] : (m.eleicao2024 && m.eleicao2024.partido ? [m.eleicao2024.partido, t("el_partido")] : null),
  ].filter(Boolean);
  const cw = (W - PAD * 2 - 25 * (cells.length - 1)) / cells.length, cy = 380, ch = 130;
  cells.forEach((cell, i) => {
    const cx = PAD + i * (cw + 25);
    x.fillStyle = "#11141c";
    if (x.roundRect) { x.beginPath(); x.roundRect(cx, cy, cw, ch, 12); x.fill(); } else x.fillRect(cx, cy, cw, ch);
    x.fillStyle = "#ffd23f"; x.font = "800 42px Sora, sans-serif"; x.fillText(String(cell[0]), cx + 22, cy + 62);
    x.fillStyle = "#9aa3b2"; x.font = "500 21px Inter, sans-serif"; x.fillText(String(cell[1]), cx + 22, cy + 100);
  });
  // rodapé
  x.fillStyle = "#9aa3b2"; x.font = "400 23px Inter, sans-serif";
  x.fillText(t("city_img_nota"), PAD, 575);
  x.fillStyle = "#46e0c0"; x.font = "600 23px Inter, sans-serif";
  x.fillText("pablonora.github.io/transparencia-eleitoral-municipios", PAD, 605);
  // download
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `${m.nome}-${m.uf}`.normalize("NFD").replace(/[^\w-]+/g, "_") + ".png";
  document.body.appendChild(a); a.click(); a.remove();
}
function linkCidade(m) {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set("cidade", m.cd_ibge);
  u.searchParams.set("lang", LANG);
  return u.toString();
}
function abrirCidade(m) {
  // guarda quem tinha o foco, para devolver ao fechar (a11y)
  if (!window._cidadeAberta) window._lastFocus = document.activeElement;
  window._cidadeAberta = m;
  track("perfil");
  const card = document.getElementById("modalCard");
  card.innerHTML = cityCardHTML(m);
  // rotula o diálogo pelo nome da cidade (aria-labelledby)
  const h3 = card.querySelector("h3");
  if (h3) { h3.id = "modalTitulo"; card.setAttribute("aria-labelledby", "modalTitulo"); }
  document.getElementById("modal").hidden = false;
  const btnFechar = document.getElementById("modalFechar");
  btnFechar.addEventListener("click", fecharModal);
  btnFechar.focus();   // move o foco pro diálogo
  const per100 = Math.round((m.razao_total || 0) * 100);
  const link = linkCidade(m);
  document.getElementById("pf-x").href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(t("city_tweet", { local: `${m.nome}-${m.uf}`, per100 }))}&url=${encodeURIComponent(link)}`;
  document.getElementById("pf-share").addEventListener("click", async () => {
    track("perfil-link");
    try {
      if (navigator.share) { await navigator.share({ title: `${m.nome}-${m.uf}`, url: link }); return; }
      await navigator.clipboard.writeText(link); toast();
    } catch (_) { /* cancelado */ }
  });
  document.getElementById("pf-img").addEventListener("click", () => {
    track("baixar-imagem");
    try { baixarImagemCidade(m); toast(t("city_img_ok")); } catch (_) {}
  });
  // Emendas: carga SOB DEMANDA por UF. O card já apareceu; buscamos emendas/{uf}.json
  // (cacheado por UF), pegamos a cidade, montamos o bloco + seletor de período. Se o
  // usuário trocar de cidade no meio, abortamos (não preenche o card errado).
  ensureEmendasUF(m.uf).then((uf) => {
    if (window._cidadeAberta !== m) return;
    const mdata = (uf.municipios || {})[m.cd_ibge] || null;
    const slot = document.getElementById("pf-emendas-slot");
    if (!slot) return;
    if (!mdata) { slot.innerHTML = ""; window._em = null; return; }
    const anos = new Set();
    mdata.emendas.forEach((e) => { for (const mm in e.m) anos.add(mm.slice(0, 4)); });
    window._em = { full: mdata, anos: [...anos].sort(), ger: uf.gerado_em };
    slot.innerHTML = emendasBlock();
    renderEmendasConteudo("", "");
    const selA = document.getElementById("em-ano"), selM = document.getElementById("em-mes");
    if (selA) selA.addEventListener("change", () => {
      selM.disabled = !selA.value;
      if (!selA.value) selM.value = "";
      renderEmendasConteudo(selA.value, selM.value);
      track("emendas-periodo");
    });
    if (selM) selM.addEventListener("change", () => renderEmendasConteudo(selA.value, selM.value));
  });
}
function abrirDeepLink() {
  const q = new URLSearchParams(location.search);
  const cd = q.get("cidade");
  if (cd && munById.has(cd)) abrirCidade(munById.get(cd));
  // comparação compartilhada por link: ?a=<ibge>&b=<ibge>
  const a = q.get("a"), b = q.get("b");
  const okA = a && munById.has(a), okB = b && munById.has(b);
  if (okA || okB) {
    if (okA) { cmpAsel = munById.get(a); document.getElementById("cmpA").value = cmpAsel.nome; }
    if (okB) { cmpBsel = munById.get(b); document.getElementById("cmpB").value = cmpBsel.nome; }
    renderCompare();
    if (okA && okB && !cd) {
      document.getElementById("compararBloco").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  }
}

/* ---------------- DESTAQUES (ticker) ---------------- */
function gerarInsights() {
  const r = DADOS.resumo, by = (f) => [...LINHAS].filter((m) => f(m) != null).sort((a, b) => f(b) - f(a))[0];
  const top = LINHAS[0];
  const idoso = by((m) => m.pct_70mais), saldo = by((m) => m.transferencias_saldo), jovem = by((m) => m.pct_16_17);
  const met = ufMetrics(); let ufTop = null;
  for (const uf in met) if (!ufTop || met[uf].pct100 > met[ufTop].pct100) ufTop = uf;
  const bnTop = by((m) => (m.eleicao2024 ? m.eleicao2024.pct_brancos_nulos : null));
  const out = [
    t("ins_1", { local: `${top.nome}-${top.uf}`, pct: PCT0(top.razao_total) }),
    t("ins_2", { n: fmt(r.n_mais_eleitores_que_pop) }),
    saldo ? t("ins_3", { local: `${saldo.nome}-${saldo.uf}`, saldo: sig0(saldo.transferencias_saldo), ano: saldo.transferencias_ano }) : "",
    idoso ? t("ins_4", { local: `${idoso.nome}-${idoso.uf}`, pct: PCT(idoso.pct_70mais) }) : "",
    ufTop ? t("ins_5", { uf: ufTop, pct: PCT(met[ufTop].pct100) }) : "",
    r.despesa_campanha_total ? t("ins_6", { v: moeda(r.despesa_campanha_total) }) : "",
    r.orcamento_saude_total ? t("ins_7", { s: moeda(r.orcamento_saude_total), e: moeda(r.orcamento_educacao_total), ano: DADOS.ano_orcamento }) : "",
    (bnTop && bnTop.eleicao2024) ? t("ins_8", { local: `${bnTop.nome}-${bnTop.uf}`, pct: PCT(bnTop.eleicao2024.pct_brancos_nulos) }) : "",
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
// link compartilhável da comparação A×B, preservando ?lang e descartando ?cidade
function linkCompare(A, B) {
  const u = new URL(location.origin + location.pathname + location.search);
  u.searchParams.delete("cidade");
  u.searchParams.set("a", A.cd_ibge);
  u.searchParams.set("b", B.cd_ibge);
  return u.toString();
}
function initComparar() {
  attachAutocomplete(document.getElementById("cmpA"), document.getElementById("acA"), (m) => { cmpAsel = m; renderCompare(); });
  attachAutocomplete(document.getElementById("cmpB"), document.getElementById("acB"), (m) => { cmpBsel = m; renderCompare(); });
  const sw = document.getElementById("cmpSwap");
  if (sw) sw.addEventListener("click", () => {
    track("comparar-swap");
    const ia = document.getElementById("cmpA"), ib = document.getElementById("cmpB");
    [cmpAsel, cmpBsel] = [cmpBsel, cmpAsel];        // troca A↔B (e o Δ inverte junto)
    const tmp = ia.value; ia.value = ib.value; ib.value = tmp;
    renderCompare();
  });
  const sh = document.getElementById("cmpShare");
  if (sh) sh.addEventListener("click", async () => {
    if (!cmpAsel || !cmpBsel) return;
    track("comparar-link");
    const link = linkCompare(cmpAsel, cmpBsel);
    try {
      if (navigator.share) { await navigator.share({ title: `${cmpAsel.nome} × ${cmpBsel.nome}`, url: link }); return; }
      await navigator.clipboard.writeText(link); toast();
    } catch (_) { /* cancelado */ }
  });
}
// formatadores tolerantes a null para o comparador
const _moedaC = (v) => (v == null ? "—" : BRL2.format(v));
const _moedaH = (v) => (v == null ? "—" : BRL0.format(v));
const _ppsuf = () => (LANG === "en" ? " pp" : " p.p.");
const _ppF = (x) => (x * 100).toFixed(1).replace(".", _dec()) + _ppsuf();  // x é fração (0.108 → 10,8 p.p.)
const _ppN = (x) => x.toFixed(1).replace(".", _dec()) + _ppsuf();          // x já em pontos % (crescimento)
function renderCompare() {
  const out = document.getElementById("compareOut");
  const sh = document.getElementById("cmpShare");
  if (!cmpAsel || !cmpBsel) { out.innerHTML = ""; if (sh) sh.hidden = true; return; }
  const A = cmpAsel, B = cmpBsel, ano = DADOS.ano_populacao;
  if (sh) sh.hidden = false;
  // reflete a comparação na URL (deep link) sem recarregar nem poluir o histórico
  try { history.replaceState(null, "", linkCompare(A, B)); } catch (_) {}
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
    { lab: t("cmp_r_eleitcresc"), f: crescEleit, fm: (v) => (v == null ? "—" : sig(v * 100)), d: _ppF },
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
    { lab: t("cmp_r_partido"), f: (m) => (m.eleicao2024 ? m.eleicao2024.partido : null), fm: (v) => v || "—" },
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
    { lab: t("cmp_r_pessoal"), f: orcF("pessoal"), fm: PCT, d: _ppF },
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

// crescimento do eleitorado entre o 1º e o último ponto da série (aptos 2014→2024).
// Devolve fração (0,061 = +6,1%); null se não há série suficiente.
function crescEleit(m) {
  const s = m.eleitorado_serie;
  if (!s || s.length < 2 || !s[0].aptos) return null;
  return (s[s.length - 1].aptos - s[0].aptos) / s[0].aptos;
}
// sparkline SVG inline da série do eleitorado (6 pontos), teal se cresceu / âmbar se caiu
function sparklineSerie(m, w, h) {
  const s = m.eleitorado_serie;
  if (!s || s.length < 2) return "";
  const ys = s.map((p) => p.aptos), mn = Math.min(...ys), mx = Math.max(...ys), rng = (mx - mn) || 1;
  const n = s.length;
  const pts = s.map((p, i) => {
    const x = (i / (n - 1)) * (w - 2) + 1;
    const y = h - 1 - ((p.aptos - mn) / rng) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = ys[n - 1] >= ys[0];
  const col = up ? "var(--accent2)" : "var(--b100)";
  const lastX = (w - 2) + 1, lastY = h - 1 - ((ys[n - 1] - mn) / rng) * (h - 2);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">` +
    `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="1.7" fill="${col}"/></svg>`;
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
  eleitcresc: { label: "mi_eleitcresc", val: crescEleit, div: [-0.1, 0, 0.4], fmt: (v) => sig(v == null ? null : v * 100), leg: ["−10%", "0", "≥+40%"] },
  abst24:  { label: "mi_abst24", val: (m) => (m.comparecimento && m.comparecimento["2024"] ? m.comparecimento["2024"].abst_pct : null), seq: [0, 0.4], fmt: (v) => PCT(v), leg: ["0%", "≥40%"] },
  abst22:  { label: "mi_abst22", val: (m) => (m.comparecimento && m.comparecimento["2022"] ? m.comparecimento["2022"].abst_pct : null), seq: [0, 0.4], fmt: (v) => PCT(v), leg: ["0%", "≥40%"] },
  gasto:   { label: "mi_gasto", val: (m) => (m.contas ? m.contas.despesa_por_eleitor : null), seq: [10, 90], fmt: (v) => (v == null ? "—" : BRL2.format(v)), leg: ["≤R$ 10", "≥R$ 90"] },
  orcsaude:{ label: "mi_orc_saude", val: (m) => (m.orcamento && m.orcamento.saude != null && m.orcamento.despesa) ? m.orcamento.saude / m.orcamento.despesa : null, seq: [0.15, 0.32], fmt: (v) => PCT(v), leg: ["≤15%", "≥32%"] },
  orceduc: { label: "mi_orc_educ", val: (m) => (m.orcamento && m.orcamento.educacao != null && m.orcamento.despesa) ? m.orcamento.educacao / m.orcamento.despesa : null, seq: [0.18, 0.42], fmt: (v) => PCT(v), leg: ["≤18%", "≥42%"] },
  bn:      { label: "mi_bn", val: (m) => (m.eleicao2024 ? m.eleicao2024.pct_brancos_nulos : null), seq: [0.02, 0.10], fmt: (v) => PCT(v), leg: ["≤2%", "≥10%"] },
  emendas_hab: { label: "mi_emendas_hab", val: (m) => (m.emendas && m.emendas.total && m.pop_total_estimada) ? m.emendas.total / m.pop_total_estimada : null, seq: [50, 2000], fmt: (v) => (v == null ? "—" : BRL0.format(v)), leg: ["≤R$ 50", "≥R$ 2 mil"] },
};
const _lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// divergente daltônico-friendly: azul ↔ laranja (em vez de azul ↔ vermelho).
// Azul/laranja é o divergente seguro para daltonismo vermelho-verde (o mais comum)
// e os dois extremos diferem também em luminância (legível até em escala de cinza).
const DIV_LO = [42, 118, 199], DIV_MID = [236, 239, 244], DIV_HI = [233, 113, 50];
function corDiv(t) {
  t = Math.max(0, Math.min(1, t));
  return t <= 0.5 ? `rgb(${_lerp(DIV_LO, DIV_MID, t / 0.5).join(",")})` : `rgb(${_lerp(DIV_MID, DIV_HI, (t - 0.5) / 0.5).join(",")})`;
}
function corInd(ind, v) {
  const semdado = temaClaro() ? "#d4dae3" : "#262b36";
  if (v == null) return semdado;   // sem dado
  if (ind.div) { const [lo, mid, hi] = ind.div; const t = v <= mid ? 0.5 * (v - lo) / (mid - lo) : 0.5 + 0.5 * (v - mid) / (hi - mid); return corDiv(t); }
  const [mn, mx] = ind.seq; return cor(Math.max(0, Math.min(1, (v - mn) / (mx - mn))));
}
const _pad = (f) => String(f.properties.codarea).padStart(2, "0");
function ufAggMap(ind) {
  const g = {}; LINHAS.forEach((m) => { const v = ind.val(m); if (v != null) (g[m.uf] || (g[m.uf] = [])).push(v); });
  const out = {}; for (const uf in g) out[uf] = mediana(g[uf]); return out;
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
    ${m.eleitorado_serie ? `<div class="pp-spark">${sparklineSerie(m, 116, 26)}<span>${t("pp_tend", { de: m.eleitorado_serie[0].ano, ate: m.eleitorado_serie[m.eleitorado_serie.length - 1].ano })}</span></div>` : ""}
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
  const grad = ind.div
    ? "linear-gradient(90deg, rgb(42,118,199), rgb(236,239,244), rgb(233,113,50))"
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
// opções do filtro de partido do prefeito (siglas únicas eleitas em 2024, ordenadas)
function preencherPartidos() {
  const sel = document.getElementById("partido");
  if (!sel) return;
  const ps = [...new Set(LINHAS.map((m) => m.eleicao2024 && m.eleicao2024.partido).filter(Boolean))].sort();
  ps.forEach((p) => { const o = document.createElement("option"); o.value = p; o.textContent = p; sel.appendChild(o); });
}
// opções da coluna escolhível (a partir de COL_INDS; rótulo i18n)
function preencherColInd() {
  const sel = document.getElementById("colInd");
  if (!sel) return;
  Object.entries(COL_INDS).forEach(([k, ci]) => {
    const o = document.createElement("option");
    o.value = k; o.dataset.i18n = ci.label; o.textContent = t(ci.label);
    sel.appendChild(o);
  });
  sel.value = colInd;
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
// 27 capitais (códigos IBGE) — para o chip "só capitais"
const CAPITAIS = new Set([
  "1200401", "2704302", "1600303", "1302603", "2927408", "2304400", "5300108",
  "3205309", "5208707", "2111300", "5103403", "5002704", "3106200", "1501402",
  "2507507", "4106902", "2611606", "2211001", "3304557", "2408102", "4314902",
  "1100205", "1400100", "4205407", "3550308", "2800308", "1721000",
]);
const CHIP_PREDS = {
  mais_eleitores_que_pop: (m) => m.mais_eleitores_que_pop,
  acima_limiar_tse: (m) => m.acima_limiar_tse,
  outlier_nacional: (m) => m.outlier_nacional,
  entrada_margem: (m) => m.eleicao2024 && m.eleicao2024.entrada_maior_que_margem,
  rev3: (m) => m.revisao && m.revisao.atende_3,
  turno2: (m) => m.eleicao2024 && m.eleicao2024.turno === "2",
  encolheu: (m) => { const c = crescEleit(m); return c != null && c < 0; },
  capital: (m) => CAPITAIS.has(m.cd_ibge),
};
// Indicadores que a coluna escolhível ("Eleitorado 2014–24" por padrão) pode exibir
// e por que ordenar. 'tend' = sparkline da série; os demais mostram o valor.
const COL_INDS = {
  tend: { label: "th_tend", spark: true },
  razao: { label: "mi_razao", val: (m) => m.razao_total, fmt: PCT },
  razao16: { label: "mi_razao16", val: (m) => m.razao_16mais, fmt: PCT },
  eleitcresc: { label: "mi_eleitcresc", val: crescEleit, fmt: (v) => (v == null ? "—" : sig(v * 100)) },
  abst24: { label: "mi_abst24", val: (m) => m._abst, fmt: PCT },
  bn: { label: "mi_bn", val: (m) => (m.eleicao2024 ? m.eleicao2024.pct_brancos_nulos : null), fmt: PCT },
  idoso: { label: "mi_idoso", val: (m) => m.pct_70mais, fmt: PCT },
  jovem: { label: "demo_1617", val: (m) => m.pct_16_17, fmt: PCT },
  superior: { label: "demo_superior", val: (m) => m.pct_superior, fmt: PCT },
  escol: { label: "mi_escol", val: (m) => m.pct_ate_fundamental, fmt: PCT },
  mulheres: { label: "demo_mulheres", val: (m) => m.pct_feminino, fmt: PCT },
  saldo: { label: "mi_saldo", val: (m) => m.transferencias_saldo, fmt: sig0 },
  cresc: { label: "mi_cresc", val: (m) => m.crescimento_pop_pct, fmt: sig },
  gasto: { label: "mi_gasto", val: (m) => (m.contas ? m.contas.despesa_por_eleitor : null), fmt: (v) => (v == null ? "—" : BRL2.format(v)) },
  orc_hab: { label: "ord_orc_hab", val: (m) => (m.orcamento && m.orcamento.despesa && m.pop_total_estimada) ? m.orcamento.despesa / m.pop_total_estimada : null, fmt: (v) => (v == null ? "—" : BRL0.format(v)) },
  emendas_hab: { label: "mi_emendas_hab", val: (m) => (m.emendas && m.emendas.total && m.pop_total_estimada) ? m.emendas.total / m.pop_total_estimada : null, fmt: (v) => (v == null ? "—" : BRL0.format(v)) },
  orcsaude: { label: "mi_orc_saude", val: (m) => (m.orcamento && m.orcamento.saude != null && m.orcamento.despesa) ? m.orcamento.saude / m.orcamento.despesa : null, fmt: PCT },
  orceduc: { label: "mi_orc_educ", val: (m) => (m.orcamento && m.orcamento.educacao != null && m.orcamento.despesa) ? m.orcamento.educacao / m.orcamento.despesa : null, fmt: PCT },
  pessoal: { label: "orc_pessoal", val: (m) => (m.orcamento && m.orcamento.pessoal != null && m.orcamento.despesa) ? m.orcamento.pessoal / m.orcamento.despesa : null, fmt: PCT },
  margem: { label: "cmp_r_margem", val: (m) => (m.eleicao2024 ? m.eleicao2024.margem : null), fmt: fmt },
};
let colInd = "tend";
const colAcc = (m) => { const ci = COL_INDS[colInd]; return ci.spark ? crescEleit(m) : ci.val(m); };
// porte por população: p < 20 mil, m 20–100 mil, g > 100 mil
function porteMatch(m) {
  if (!porteSel) return true;
  const p = m.pop_total_estimada || 0;
  return porteSel === "p" ? p < 20000 : porteSel === "m" ? (p >= 20000 && p <= 100000) : p > 100000;
}
function filtrar() {
  return LINHAS.filter((m) => {
    if (ufSel && m.uf !== ufSel) return false;
    if (busca && !m.nome.toLowerCase().includes(busca)) return false;
    if (!porteMatch(m)) return false;
    if (partidoSel && !(m.eleicao2024 && m.eleicao2024.partido === partidoSel)) return false;
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
  const acc = k === "_colind" ? colAcc : ORD_ACC[k];   // coluna escolhível
  return linhas.slice().sort((a, b) => {
    if (!acc && (k === "nome" || k === "uf")) return ordemDesc ? String(b[k]).localeCompare(a[k]) : String(a[k]).localeCompare(b[k]);
    let va = acc ? acc(a) : a[k], vb = acc ? acc(b) : b[k];
    va = va == null ? -Infinity : va; vb = vb == null ? -Infinity : vb;
    return ordemDesc ? vb - va : va - vb;
  });
}
// Deep link do explorador: reflete UF + busca + ordenação + marcadores + indicador
// do mapa na URL (preservando lang/cidade/a/b), e restaura no carregamento. Assim
// uma "visão filtrada" (ex.: PI ordenado por abstenção) vira um link compartilhável.
function sincronizarURLExplorador() {
  try {
    const u = new URL(location.href), sp = u.searchParams;
    const setDel = (k, v) => { if (v) sp.set(k, v); else sp.delete(k); };
    setDel("uf", ufSel);
    setDel("q", busca);
    setDel("porte", porteSel);
    setDel("partido", partidoSel);
    setDel("col", (colInd && colInd !== "tend") ? colInd : "");
    if (ordenarPor && ordenarPor !== "razao_total") { sp.set("ord", ordenarPor); sp.set("dir", ordemDesc ? "desc" : "asc"); }
    else { sp.delete("ord"); sp.delete("dir"); }
    setDel("flags", [...flagsAtivas].join(","));
    setDel("map", (mapInd && mapInd !== "razao") ? mapInd : "");
    history.replaceState(null, "", u);
  } catch (_) {}
}
function restaurarExploradorDaURL() {
  const sp = _urlInicial || new URLSearchParams(location.search);
  const uf = sp.get("uf");
  if (uf && (DADOS.ufs || []).includes(uf)) {
    ufSel = uf;
    document.querySelectorAll("select.uf-sync").forEach((s) => { s.value = uf; });
  }
  const q = sp.get("q");
  if (q) { busca = q.trim().toLowerCase(); const b = document.getElementById("busca"); if (b) b.value = q; }
  const porte = sp.get("porte");
  if (["p", "m", "g"].includes(porte)) { porteSel = porte; const e = document.getElementById("porte"); if (e) e.value = porte; }
  const part = sp.get("partido");
  if (part) { const e = document.getElementById("partido"); if (e && [...e.options].some((o) => o.value === part)) { partidoSel = part; e.value = part; } }
  const col = sp.get("col");
  if (col && COL_INDS[col]) {
    colInd = col; const e = document.getElementById("colInd"); if (e) e.value = col;
    if (col === "emendas_hab" && !EMENDAS_RESUMO) ensureEmendasResumo().then(render);   // carga sob demanda
  }
  const ord = sp.get("ord");
  if (ord) {
    ordenarPor = ord; ordemDesc = sp.get("dir") !== "asc";
    const os = document.getElementById("ordcampo");
    if (os && [...os.options].some((o) => o.value === ord)) os.value = ord;
  }
  const flags = sp.get("flags");
  if (flags) {
    flags.split(",").filter(Boolean).forEach((f) => flagsAtivas.add(f));
    document.querySelectorAll(".chip").forEach((c) => {
      if (flagsAtivas.has(c.dataset.flag)) c.setAttribute("aria-pressed", "true");
    });
  }
  const map = sp.get("map");
  if (map && MAP_INDS[map]) {
    mapInd = map; const ms = document.getElementById("mapaInd"); if (ms) ms.value = map;
    if (map === "emendas_hab" && !EMENDAS_RESUMO) ensureEmendasResumo().then(recolorMapa);  // carga sob demanda
  }
}
function render() {
  const todas = ordenar(filtrar());
  const linhas = todas.slice(0, LIMITE_LINHAS);
  const accOrd = ORD_ACC[ordenarPor], fmtOrd = ORD_FMT[ordenarPor] || fmt;
  const ci = COL_INDS[colInd];                 // coluna escolhível
  const colCell = (m) => ci.spark ? sparklineSerie(m, 60, 18)
    : (() => { const v = ci.val(m); return v == null ? "—" : `<span class="ordv">${ci.fmt(v)}</span>`; })();
  const lbl = document.getElementById("colLabel"); if (lbl) lbl.textContent = t(ci.label);
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
        <td class="spark-cell">${colCell(m)}</td>
        <td class="mk">${badges(m)}</td>
      </tr>`;
  }).join("");

  const trunc = todas.length > LIMITE_LINHAS ? t("tbl_trunc", { n: fmt(LIMITE_LINHAS) }) : "";
  document.getElementById("contagem").textContent = t("tbl_contagem", { x: fmt(todas.length), y: fmt(LINHAS.length), trunc });
  document.querySelectorAll("th[data-k]").forEach((th) => {
    th.removeAttribute("aria-sort");
    if (th.dataset.k === ordenarPor) th.setAttribute("aria-sort", ordemDesc ? "descending" : "ascending");
  });
  sincronizarURLExplorador();
}

/* ---------------- EVENTOS ---------------- */
function bind() {
  document.getElementById("busca").addEventListener("input", (e) => { busca = e.target.value.trim().toLowerCase(); render(); });
  document.querySelectorAll("select.uf-sync").forEach((s) =>
    s.addEventListener("change", (e) => { track("filtro-uf"); setUF(e.target.value); }));
  const porteEl = document.getElementById("porte");
  if (porteEl) porteEl.addEventListener("change", (e) => { porteSel = e.target.value; track("filtro-porte" + (porteSel ? "-" + porteSel : "-todos")); render(); });
  const partidoEl = document.getElementById("partido");
  if (partidoEl) partidoEl.addEventListener("change", (e) => { partidoSel = e.target.value; track("filtro-partido"); render(); });
  const colEl = document.getElementById("colInd");
  if (colEl) colEl.addEventListener("change", (e) => {
    colInd = e.target.value;
    track("coluna-" + colInd);
    ordenarPor = "_colind"; ordemDesc = true;   // escolher um indicador já ordena por ele
    // emendas é carga sob demanda: dispara o load e re-renderiza quando chegar
    if (colInd === "emendas_hab" && !EMENDAS_RESUMO) ensureEmendasResumo().then(render);
    render();
  });
  const ordSel = document.getElementById("ordcampo");
  if (ordSel) ordSel.addEventListener("change", (e) => {
    ordenarPor = e.target.value || "razao_total"; ordemDesc = true; render();
  });
  const histSel = document.getElementById("histInd");
  if (histSel) histSel.addEventListener("change", (e) => {
    histInd = e.target.value;
    if (histInd === "emendas_hab" && !EMENDAS_RESUMO) ensureEmendasResumo().then(renderHistograma);  // carga sob demanda
    renderHistograma();
  });
  document.getElementById("mapaInd").addEventListener("change", (e) => {
    mapInd = e.target.value; track("mapa-" + mapInd);
    if (mapInd === "emendas_hab" && !EMENDAS_RESUMO) ensureEmendasResumo().then(recolorMapa);  // carga sob demanda
    recolorMapa(); sincronizarURLExplorador();
  });
  document.querySelectorAll("#mapaFiltro button").forEach((b) => {
    b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
    b.addEventListener("click", () => {
      document.querySelectorAll("#mapaFiltro button").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
      b.classList.add("on"); b.setAttribute("aria-pressed", "true"); destaque = b.dataset.f; track("mapa-destaque-" + destaque); recolorMapa();
    });
  });
  document.getElementById("mapaVoltar").addEventListener("click", voltarBrasil);
  document.querySelectorAll(".chip").forEach((c) => {
    c.setAttribute("aria-pressed", "false");
    c.addEventListener("click", () => {
      const f = c.dataset.flag;
      track("chip-" + f);
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
  document.getElementById("btnExplorar").addEventListener("click", () => {
    track("explorar");
    document.getElementById("explorar").scrollIntoView({ behavior: scrollBehavior() });
  });
  document.getElementById("btnShare").addEventListener("click", async () => {
    track("compartilhar");
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title: document.title, url }); return; }
      await navigator.clipboard.writeText(url); toast();
    } catch (_) { /* cancelado */ }
  });
  const dlJson = document.querySelector('a[href="data/brasil.json"]');
  if (dlJson) dlJson.addEventListener("click", () => track("baixar-json"));
  const meto = document.querySelector("#metodologia details");
  if (meto) meto.addEventListener("toggle", () => { if (meto.open) track("metodologia"); });
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
