/* =========================================================
 * SG Office Mobile — PWA de consulta e ações rápidas
 * Fala direto com o Supabase (chave publishable + RLS):
 *   login  → /auth/v1/token (grant_type=password)
 *   dados  → /rest/v1/dados?chave=like.sgo_*  (espelho do app desktop)
 *   escopo → u.empresas do usuário (igual Auth.escopoEmpresas do desktop)
 * ========================================================= */
'use strict';

const VERSAO = '1.3.18';
const SUPA = (window.SGO_CFG?.SUPABASE_URL || '').replace(/\/$/, '');
const AKEY = window.SGO_CFG?.SUPABASE_KEY || '';
const K_SESS = 'sgo_mob_sess';      // {access_token, refresh_token, usuario, user_id}
const K_TEMA = 'sgo_mob_tema';
const K_FUNDO = 'sgo_mob_fundo';
const K_BIO = 'sgo_mob_bio';
const K_DEV = 'sgo_mob_dev';

/* paletas e fundos — o 'sacro' e o padrao definido em :root */
const PALETAS = [
    { id: 'sacro',     nome: 'Dourado',   bg: '#0b1220', ac: '#f59e0b' },
    { id: 'claro',     nome: 'Claro',     bg: '#faf7f2', ac: '#d97706' },
    { id: 'noturno',   nome: 'Noturno',   bg: '#070d1c', ac: '#60a5fa' },
    { id: 'oliva',     nome: 'Oliva',     bg: '#0d150a', ac: '#a3e635' },
    { id: 'ametista',  nome: 'Ametista',  bg: '#120e1f', ac: '#a78bfa' },
    { id: 'vinho',     nome: 'Vinho',     bg: '#1a0b12', ac: '#f472b6' },
    { id: 'terracota', nome: 'Terracota', bg: '#180f08', ac: '#fb923c' },
    { id: 'oceano',    nome: 'Oceano',    bg: '#08141c', ac: '#22d3ee' },
];
const FUNDOS = [
    { id: 'linhas',   nome: 'Linhas',   ico: 'fa-water' },
    { id: 'estrelas', nome: 'Estrelas', ico: 'fa-star' },
    { id: 'malha',    nome: 'Malha',    ico: 'fa-border-all' },
    { id: 'brasas',   nome: 'Brasas',   ico: 'fa-fire' },
    { id: 'chuva',    nome: 'Chuva',    ico: 'fa-cloud-rain' },
    { id: 'cordas',   nome: 'Cordas',   ico: 'fa-wave-square' },
    { id: 'aura',     nome: 'Aura',     ico: 'fa-circle-half-stroke' },
    { id: 'liso',     nome: 'Liso',     ico: 'fa-ban' },
];

/* tema (data-tema) + fundo (data-fundo) — fixos por dispositivo */
function aplicarAparencia() {
    document.body.dataset.tema = localStorage.getItem(K_TEMA) || 'sacro';
    document.body.dataset.fundo = localStorage.getItem(K_FUNDO) || 'linhas';
    if ($('#modal-ap')?.classList.contains('aberto')) montarAparencia();
}
function setTema(t) { localStorage.setItem(K_TEMA, t); aplicarAparencia(); }
function setFundo(f) { localStorage.setItem(K_FUNDO, f); aplicarAparencia(); }

/* modal Aparência: grade de paletas + grade de fundos com seleção atual */
function montarAparencia() {
    const t = localStorage.getItem(K_TEMA) || 'sacro';
    const f = localStorage.getItem(K_FUNDO) || 'linhas';
    $('#ap-paletas').innerHTML = PALETAS.map(p => `
        <button class="ap-sw ${p.id === t ? 'sel' : ''}" onclick="setTema('${p.id}')">
            <span class="mini" style="background:${p.bg}">
                <i class="fa-solid fa-circle" style="color:${p.ac}"></i></span>
            ${p.nome}</button>`).join('');
    $('#ap-fundos').innerHTML = FUNDOS.map(x => `
        <button class="ap-tile ${x.id === f ? 'sel' : ''}" onclick="setFundo('${x.id}')">
            <i class="fa-solid ${x.ico}"></i>${x.nome}</button>`).join('');
}

/* id único do aparelho (exibido em Sistema, como no SGE) */
const DEV_ID = (() => {
    let d = localStorage.getItem(K_DEV);
    if (!d) { d = crypto.randomUUID(); localStorage.setItem(K_DEV, d); }
    return d;
})();

/* helpers base64url p/ WebAuthn */
const _b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const _unb64 = (s) => Uint8Array.from(
    atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer;
const K_ESCOPO = 'sgo_mob_escopo';  // admin: 'total'|'carteira'

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- datas ---------- */
const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const hojeISO = () => hoje0().toISOString().slice(0, 10);
const diasPara = (iso) => iso == null ? null
    : Math.round((new Date(String(iso).slice(0, 10) + 'T00:00:00') - hoje0()) / 864e5);
const fmtData = (iso) => {
    if (!iso) return '—';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};
const compAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

/* ---------- toast / status ---------- */
let _toastT;
function toast(msg, erro) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (erro ? ' toast-erro' : '');
    clearTimeout(_toastT);
    _toastT = setTimeout(() => t.classList.add('hidden'), 3200);
}
const setStatus = (on) => {
    $('#dot-status').className = 'dot-status ' + (on ? 'on' : 'off');
    const t = $('#txt-status'); if (t) t.textContent = on ? 'Conectado' : 'Offline';
};
const splashSync = (v) => $('#splash-sync').classList.toggle('hidden', !v);

/* overlay de progresso da atualização (verificando → baixando → recarregando) */
function updOverlay(msg) {
    const o = $('#upd-overlay');
    if (!o) return;
    if (msg === null) { o.classList.add('hidden'); return; }
    $('#upd-msg').textContent = msg;
    o.classList.remove('hidden');
}

/* cheque determinístico de versão — compara VERSAO local c/ o versao.json
   da rede (sem cache) — usado no boot e no botão "Atualizar aplicativo".
   Retorna true (vai recarregar), false (já atualizado) ou null (offline).
   O guarda sgo_vtry guarda "versao|timestamp": só bloqueia retry da mesma
   versão por 3 min (janela do CDN do Pages propagar), nunca pra sempre. */
async function checarVersao(forcar) {
    try {
        const j = await fetch('versao.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null);
        if (!j || j.versao === VERSAO) return false;
        const tent = (sessionStorage.getItem('sgo_vtry') || '').split('|');
        if (!forcar && tent[0] === j.versao && Date.now() - (+tent[1] || 0) < 180000)
            return false;
        sessionStorage.setItem('sgo_vtry', `${j.versao}|${Date.now()}`);
        updOverlay(`Nova versão v${j.versao} — atualizando…`);
        try {
            const reg = await navigator.serviceWorker?.getRegistration();
            await reg?.update();
            /* dá 4s p/ o SW novo assumir (controllerchange já recarrega) */
            await new Promise(r => setTimeout(r, 4000));
            /* CDN ainda velho? limpa tudo e recarrega furando o cache */
            if (caches) for (const k of await caches.keys()) await caches.delete(k);
            await reg?.unregister();
        } catch { /* sem SW */ }
        location.href = location.pathname + '?u=' + Date.now();
        return true;
    } catch { updOverlay(null); return null; }
}

/* ---------- REST helpers ---------- */
async function rest(path, opts = {}, token) {
    const r = await fetch(`${SUPA}/rest/v1/${path}`, {
        ...opts,
        headers: {
            apikey: AKEY,
            Authorization: `Bearer ${token || M.sess?.access_token || AKEY}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {})
        }
    });
    if (r.status === 401 && M.sess) { await M.renovar(); return rest(path, opts); }
    return r;
}

/* ---------- tabelas reais (mesmo mapa do SupaCon no desktop) ----------
 * {colecao: [tabela, {campo_json: coluna}]} — campos fora do mapa vivem
 * em `extra jsonb` e são recombinados na leitura (flat). */
const TABELAS = {
    empresas: ['empresas', {
        codigo: 'codigo', nome: 'nome', cnpj: 'cnpj',
        inscricaoEstadual: 'inscricao_estadual', cei: 'cei',
        municipio: 'municipio', uf: 'uf', regime: 'regime',
        responsavel: 'responsavel', telefone: 'telefone', ativa: 'ativa' }],
    funcionarios: ['funcionarios', {
        empresa_id: 'empresa_id', nome: 'nome', cargo: 'cargo',
        admissao: 'admissao', demissao: 'demissao', situacao: 'situacao' }],
    fiscal_obrigacoes: ['fiscal_obrigacoes', { nome: 'nome' }],
    fiscal_status: ['fiscal_status', {
        empresa_id: 'empresa_id', competencia: 'competencia',
        obrigacao_id: 'obrigacao_id', status: 'status', por: 'por', em: 'em' }],
    folha_fechamentos: ['folha_fechamentos', {
        empresa_id: 'empresa_id', competencia: 'competencia',
        status: 'status', por: 'por', em: 'em' }],
    bi_mensal: ['bi_mensal', {
        empresa_id: 'empresa_id', competencia: 'competencia',
        faturamento: 'faturamento', funcionarios: 'funcionarios' }],
    situacao_fiscal: ['situacao_fiscal', {
        empresa_id: 'empresa_id', origem: 'origem', situacao: 'situacao',
        regime: 'regime', diagnostico: 'diagnostico',
        qtd_debitos: 'qtd_debitos', total_debitos: 'total_debitos',
        atualizado_em: 'atualizado_em' }],
    certidoes: ['certidoes', {
        empresa_id: 'empresa_id', tipo: 'tipo', cnd_tipo: 'cnd_tipo',
        numero: 'numero', emissao: 'emissao', vencimento: 'vencimento',
        pendente: 'pendente', via_matriz: 'via_matriz' }],
    certificados: ['certificados', {
        empresa_id: 'empresa_id', titular: 'titular', tipo: 'tipo',
        emissao: 'emissao', vencimento: 'vencimento' }],
    lembretes: ['lembretes', {
        empresa_id: 'empresa_id', titulo: 'titulo', tipo: 'tipo',
        prazo: 'prazo', origem: 'origem', criado_em: 'criado_em' }],
    tarefas: ['tarefas', {
        empresa_id: 'empresa_id', titulo: 'titulo', prazo: 'prazo',
        descricao: 'descricao', coluna: 'coluna', concluido_em: 'concluido_em',
        criado_por: 'criado_por', criado_em: 'criado_em' }],
    usuarios: ['usuarios', {
        usuario: 'usuario', nome: 'nome', cpf: 'cpf', email: 'email',
        papel: 'papel', status: 'status', permissoes: 'permissoes' }],
};
/* coleções sem tabela própria: ficam em `dados` como sgo_* */
const CHAVES_DADOS = ['sgo_guias', 'sgo_declaracoes'];
/* select por tabela (quando diferente de *) — usuarios NÃO baixa `senha` */
const SELECTS = {
    usuarios: 'id,usuario,nome,cpf,email,papel,status,permissoes,auth_user_id,extra'
};

/* recombina uma linha REST (colunas + extra) no formato do app */
function flat(colecao, r) {
    const reg = { id: r.id, ...(r.extra || {}) };
    const mapa = TABELAS[colecao][1];
    for (const [j, col] of Object.entries(mapa))
        if (r[col] != null) reg[j] = r[col];
    return reg;
}

/* separa registro do app em {colunas, extra} p/ PATCH/upsert pontual */
function splitar(colecao, reg) {
    const mapa = TABELAS[colecao][1];
    const row = {}, extra = {};
    for (const [k, v] of Object.entries(reg)) {
        if (k === 'id' || k === 'updated_at' || k === 'updated_by') continue;
        (mapa[k] ? row : extra)[mapa[k] || k] = v;
    }
    return { row, extra };
}

/* ---------- estado ---------- */
const M = window.M = {
    sess: null,          // sessão auth
    usuario: null,       // registro sgo_usuarios do usuário logado
    dados: {},           // {colecao: [registros]}
    _aba: 'inicio',
    _busca: '',
    _prazoF: 'todos',    // filtro prazos
    _tarefasF: 'abertas',
    _emp: null,          // empresa aberta no detalhe

    /* ==================== AUTH ==================== */
    /* resolve a entrada (usuário / CPF / e-mail) no e-mail do Supabase Auth
       via RPC sgo_login_email (migration 006) — igual ao /api/login do
       desktop, que aceita usuário, e-mail e CPF. */
    async _emailDoLogin(usuario) {
        const u = usuario.trim();
        if (u.includes('@')) return u;
        try {
            const r = await fetch(`${SUPA}/rest/v1/rpc/sgo_login_email`, {
                method: 'POST',
                headers: { apikey: AKEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ p_login: u })
            });
            if (r.ok) return await r.json();       // e-mail ou null
        } catch { /* sem rede/RPC: cai no fallback */ }
        // fallback (RPC ausente): mesma regra sintética do desktop
        return `${u.replace(/[^\w.+-]/g, '').toLowerCase()}@sgoffice.local`;
    },

    async login(usuario, senha) {
        const email = await M._emailDoLogin(usuario);
        if (!email) throw new Error('Usuário ou senha inválidos.');
        const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { apikey: AKEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: senha })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error_description || j.msg || 'Usuário ou senha inválidos.');
        M.sess = { access_token: j.access_token, refresh_token: j.refresh_token,
                   usuario, email, user_id: j.user?.id, em: Date.now() };
        localStorage.setItem(K_SESS, JSON.stringify(M.sess));
    },

    async renovar() {
        if (!M.sess?.refresh_token) return false;
        let r;
        try {
            r = await fetch(`${SUPA}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: { apikey: AKEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: M.sess.refresh_token })
            });
        } catch { return false; }   // falha de rede: mantém a sessão (offline)
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            // refresh_token realmente morto → única hora de derrubar a sessão
            if (r.status === 400 || r.status === 401) {
                M.sair(true);
                const e = $('#login-erro');
                if (e) { e.textContent = 'Sua sessão expirou — entre com a senha.'; e.classList.remove('hidden'); }
            }
            return false;
        }
        M.sess.access_token = j.access_token;
        M.sess.refresh_token = j.refresh_token || M.sess.refresh_token;
        localStorage.setItem(K_SESS, JSON.stringify(M.sess));
        return true;
    },

    sair(silencioso) {
        localStorage.removeItem(K_SESS);
        M.sess = null; M.usuario = null; M.dados = {};
        M.toggleMenu(false);
        $('#bio-lock').classList.add('hidden');
        $('#app').classList.add('hidden');
        $('#tela-login').classList.remove('hidden');
        if (!silencioso) toast('Sessão encerrada.');
    },

    /* ---------- menu lateral + aparência ---------- */
    toggleMenu(abrir) {
        if (abrir) M.renderMenu();
        $('#menu').classList.toggle('aberto', !!abrir);
        $('#menu-veu').classList.toggle('aberto', !!abrir);
    },
    modalAparencia(abrir) {
        if (abrir) montarAparencia();
        $('#modal-ap').classList.toggle('aberto', !!abrir);
    },
    renderMenu() {
        const u = M.usuario || {};
        const bio = !!localStorage.getItem(K_BIO);
        const tema = (PALETAS.find(p => p.id === document.body.dataset.tema) || {}).nome || '—';
        const fundo = (FUNDOS.find(x => x.id === document.body.dataset.fundo) || {}).nome || '—';
        const escopoCart = localStorage.getItem(K_ESCOPO) === 'carteira';
        $('#menu').innerHTML = `
        <div class="menu-user">
            <div class="menu-avatar">${iniciais(u.nome)}</div>
            <div style="flex:1;min-width:0">
                <b style="display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.nome || '—')}</b>
                <span style="font-size:11px;color:var(--txt2)">${u.papel === 'admin' ? 'Administrador' : 'Colaborador'}</span>
            </div>
        </div>
        ${u.papel === 'admin' && Array.isArray(u.empresas) ? `<div class="menu-sec"><div class="menu-sec-titulo">VISÃO</div>
            <button class="menu-item" onclick="M.toggleEscopoMenu()"><i class="fa-solid fa-briefcase"></i>
            Só minha carteira<small>${escopoCart ? 'ativado' : 'todas as empresas'}</small></button></div>` : ''}
        <div class="menu-sec"><div class="menu-sec-titulo">APARÊNCIA</div>
            <button class="menu-item" onclick="M.toggleMenu(false);M.modalAparencia(true)">
            <i class="fa-solid fa-palette"></i>Tema e fundo<small>${tema} · ${fundo}</small></button></div>
        <div class="menu-sec"><div class="menu-sec-titulo">CONTA</div>
            <button class="menu-item" onclick="M.toggleMenu(false);M.aba('perfil')">
            <i class="fa-solid fa-user"></i>Meu perfil</button>
            ${window.PublicKeyCredential ? `
            <button class="menu-item" onclick="M.toggleBio()"><i class="fa-solid fa-fingerprint"></i>
            ${bio ? 'Desativar digital/FaceID' : 'Ativar digital/FaceID'}<small>${bio ? 'ativado' : ''}</small></button>` : ''}
        </div>
        <div class="menu-sec"><div class="menu-sec-titulo">SISTEMA</div>
            <button class="menu-item" onclick="M.atualizarApp()"><i class="fa-solid fa-rotate"></i>Atualizar aplicativo</button>
            <button class="menu-item" onclick="M.copiarDev()"><i class="fa-solid fa-mobile-screen"></i>ID do aparelho<small>${DEV_ID.slice(0, 8)}…</small></button>
            <button class="menu-item" onclick="navigator.clipboard?.writeText('SGO Mobile v${VERSAO}');toast('Versão copiada.')">
            <i class="fa-solid fa-code-branch"></i>SG Office Mobile<small>v${VERSAO}</small></button>
            <button class="menu-item" onclick="M.sair()"><i class="fa-solid fa-right-from-bracket"></i>Sair da sessão</button>
        </div>`;
    },
    toggleEscopoMenu() { M.toggleEscopo(); M.renderMenu(); },
    copiarDev() { navigator.clipboard?.writeText(DEV_ID); toast('ID do aparelho copiado.'); },
    async atualizarApp() {
        updOverlay('Verificando atualização…');
        const r = await checarVersao(true);
        if (r === false) { updOverlay(null); toast(`Já está na versão mais recente (v${VERSAO}).`); }
        else if (r === null) { updOverlay(null); toast('Sem conexão para verificar.', true); }
        /* r === true → overlay continua visível até o reload */
    },

    /* ---------- biometria (WebAuthn platform: digital/FaceID) ---------- */
    async toggleBio() {
        if (localStorage.getItem(K_BIO)) {
            localStorage.removeItem(K_BIO);
            toast('Digital desativada neste aparelho.');
            M.renderMenu();
            return;
        }
        try {
            const cred = await navigator.credentials.create({ publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: { name: 'SG Office' },
                user: { id: crypto.getRandomValues(new Uint8Array(16)),
                        name: M.sess?.email || 'usuario',
                        displayName: M.usuario?.nome || 'Usuário' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
                timeout: 60000, attestation: 'none' } });
            if (!cred) throw 0;
            localStorage.setItem(K_BIO, _b64u(cred.rawId));
            toast('Digital ativada! Na próxima abertura ela será pedida.');
            M.renderMenu();
        } catch { toast('Não foi possível ativar a digital.', true); }
    },
    async bioEntrar() {
        try {
            const id = _unb64(localStorage.getItem(K_BIO));
            await navigator.credentials.get({ publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                allowCredentials: [{ type: 'public-key', id }],
                userVerification: 'required', timeout: 60000 } });
            $('#bio-lock').classList.add('hidden');
            $('#tela-login').classList.add('hidden');
            $('#app').classList.remove('hidden');
            await M.sincronizar(true);
        } catch { /* cancelou ou falhou — permanece no lock */ }
    },
    bioUsarSenha() { M.sair(true); },

    /* ==================== DADOS ==================== */
    async carregar() {
        // tabelas reais em paralelo + chaves avulsas de `dados`
        const colecoes = Object.keys(TABELAS);
        const reqs = colecoes.map(c =>
            rest(`${TABELAS[c][0]}?select=${SELECTS[c] || '*'}`).then(async r =>
                r.ok ? r.json() : { __erro: r.status }));
        reqs.push(rest(`dados?chave=in.(${CHAVES_DADOS.join(',')})&select=chave,valor`)
            .then(r => r.ok ? r.json() : []));
        const res = await Promise.all(reqs);
        if (res.slice(0, colecoes.length).every(x => x && x.__erro))
            throw new Error(`Sem acesso aos dados (HTTP ${res[0].__erro}). ` +
                'O admin precisa rodar a migration 005 no Supabase.');
        const dados = {};
        colecoes.forEach((c, i) => {
            dados[c] = Array.isArray(res[i]) ? res[i].map(r => flat(c, r)) : [];
        });
        for (const l of (res.at(-1) || [])) {
            const nome = l.chave.replace(/^sgo_/, '');
            dados[nome] = Array.isArray(l.valor) ? l.valor
                : (() => { try { return JSON.parse(l.valor); } catch { return []; } })();
        }
        M.dados = dados;
        // resolve o usuário logado em `usuarios` — casa pelo e-mail usado
        // no Auth (funciona p/ usuário, CPF e e-mail digitados)
        const us = dados.usuarios || [];
        const em = (M.sess.email || '').toLowerCase();
        const dig = String(M.sess.usuario || '').replace(/\D/g, '');
        M.usuario = us.find(u =>
            (u.email && u.email.toLowerCase() === em) ||
            ((u.email || `${u.usuario}@sgoffice.local`).toLowerCase() === em) ||
            u.usuario === M.sess.usuario ||
            (dig.length === 11 && String(u.cpf || '').replace(/\D/g, '') === dig)
        ) || { nome: M.sess.usuario, papel: 'colaborador', permissoes: {}, status: 'aprovado' };
    },

    async sincronizar(manual) {
        if (!M.sess) return;
        splashSync(true); setStatus(true);
        try {
            await M.carregar();
            M.render();
            if (manual) toast('Dados atualizados.');
        } catch (e) {
            setStatus(false);
            if (manual) toast(e.message || 'Sem conexão com a nuvem.', true);
        } finally { splashSync(false); }
    },

    cole(c) { return M.dados[c] || []; },
    empresa(id) { return M.cole('empresas').find(e => e.id === id); },

    /* ---------- escopo (igual Auth.escopoEmpresas do desktop) ---------- */
    escopo() {
        const u = M.usuario;
        if (!u) return null;
        if (u.papel === 'admin')
            return Array.isArray(u.empresas) && localStorage.getItem(K_ESCOPO) === 'carteira'
                ? new Set(u.empresas) : null;
        return Array.isArray(u.empresas) ? new Set(u.empresas) : null;
    },
    dentroEscopo(empresa_id) { const s = M.escopo(); return !s || !empresa_id || s.has(empresa_id); },
    filtra(colecao, campo = 'empresa_id') {
        const itens = M.cole(colecao);
        if (colecao === 'empresas') { const s = M.escopo(); return s ? itens.filter(e => s.has(e.id)) : itens; }
        return itens.filter(x => M.dentroEscopo(x[campo]));
    },
    pode(modulo) {
        const u = M.usuario;
        if (!u) return false;
        if (u.papel === 'admin') return true;
        return (u.permissoes || {})[modulo] === 'editar';
    },

    /* ---------- gravação pontual (mesma linha que o desktop gravaria) ---------- */
    async _patch(colecao, id, campos) {
        const { row, extra } = splitar(colecao, campos._reg || {});
        const corpo = { ...row, updated_by: 'mobile:' + (M.usuario?.nome || '?') };
        if (campos._extra !== undefined) corpo.extra = campos._extra;
        delete campos._reg; delete campos._extra;
        const r = await rest(`${TABELAS[colecao][0]}?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH', body: JSON.stringify({ ...corpo, ...campos })
        });
        if (!r.ok) {
            const t = await r.text().catch(() => '');
            throw new Error(`Falha ao gravar (HTTP ${r.status}). ${t.slice(0, 120)}`);
        }
    },

    async concluirTarefa(id) {
        await M._patch('tarefas', id, { coluna: 'concluido', concluido_em: Date.now() });
        const t = M.cole('tarefas').find(x => x.id === id);
        if (t) { t.coluna = 'concluido'; t.concluido_em = Date.now(); }
        toast('Tarefa concluída.'); M.render();
    },
    async reabrirTarefa(id) {
        await M._patch('tarefas', id, { coluna: 'afazer', concluido_em: null });
        const t = M.cole('tarefas').find(x => x.id === id);
        if (t) { t.coluna = 'afazer'; t.concluido_em = null; }
        M.render();
    },
    async concluirLembrete(id) {
        // `concluido` vive na coluna extra jsonb — manda o extra inteiro mesclado
        const reg = M.cole('lembretes').find(x => x.id === id);
        const { extra } = splitar('lembretes', reg || {});
        await M._patch('lembretes', id, { _extra: { ...extra, concluido: true } });
        if (reg) reg.concluido = true;
        toast('Lembrete concluído.'); M.render();
    },

    /* ==================== NAVEGAÇÃO ==================== */
    aba(nome) {
        M._aba = nome;
        M._emp = null; M._busca = '';
        document.querySelectorAll('.nav-btn').forEach(b =>
            b.classList.toggle('ativo', b.dataset.aba === nome));
        const titulos = { inicio: 'Panorama', fiscal: 'Fiscal', folha: 'Folha',
                          situacao: 'Situação fiscal', prazos: 'Prazos e documentos',
                          empresas: 'Empresas', perfil: 'Perfil' };
        $('#topo-titulo').textContent = titulos[nome] || 'SG Office';
        M.render();
        $('#conteudo').scrollTop = 0;
    },

    render() {
        M.badges();
        const map = { inicio: R.inicio, empresas: R.empresas, prazos: R.prazos,
                      fiscal: R.fiscal, folha: R.folha, situacao: R.situacao,
                      tarefas: R.tarefas, perfil: R.perfil };
        $('#conteudo').innerHTML = M._emp ? R.empresaDetalhe(M._emp) : (map[M._aba] || R.inicio)();
        initBiCharts();
        statTicker();
    },

    badges() {
        const n = itensPrazo().filter(i => (i.dias ?? 99) <= 15).length
            + M.filtra('tarefas').filter(t => (t.coluna || 'afazer') !== 'concluido').length;
        const b = $('#badge-prazos');
        if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
    },

    pzSub(s) { M._pzSub = s; M.render(); },
    panSub(s) { M._panSub = s; M.render(); },
    setComp(c) { M._comp = c; M.render(); },

    voltarEmpresa() { M._emp = null; M.render(); },
    empAno(d) { M._empAno = (M._empAno || new Date().getFullYear()) + d; M.render(); },
    async salvarBi() {
        if (!M.pode('empresas')) throw new Error('Sem permissão para editar.');
        const comp = $('#bi-comp')?.value;
        if (!comp) throw new Error('Informe a competência.');
        const fat = parseFloat(String($('#bi-fat-in').value || '')
            .replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0;
        let func = $('#bi-fun-in').value.trim();
        func = func === '' ? null : parseInt(func, 10);
        if (func !== null && isNaN(func)) func = null;
        const ex = M.cole('bi_mensal').find(x => x.empresa_id === M._emp && x.competencia === comp);
        if (ex) {
            await M._patch('bi_mensal', ex.id, { faturamento: fat, funcionarios: func });
            ex.faturamento = fat; ex.funcionarios = func;
        } else {
            const id = crypto.randomUUID?.()
                || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
            const r = await rest(TABELAS.bi_mensal[0], { method: 'POST',
                headers: { Prefer: 'return=minimal' },
                body: JSON.stringify({ id, empresa_id: M._emp, competencia: comp,
                    faturamento: fat, funcionarios: func, extra: {},
                    updated_by: 'mobile:' + (M.usuario?.nome || '?') }) });
            if (!r.ok) throw new Error('Falha ao lançar (HTTP ' + r.status + ').');
            (M.dados.bi_mensal = M.dados.bi_mensal || [])
                .push({ id, empresa_id: M._emp, competencia: comp, faturamento: fat, funcionarios: func });
        }
        toast('Lançamento salvo.'); M.render();
    },
    async excluirBi(id) {
        if (!M.pode('empresas')) throw new Error('Sem permissão para editar.');
        const r = await rest(`${TABELAS.bi_mensal[0]}?id=eq.${encodeURIComponent(id)}`,
            { method: 'DELETE' });
        if (!r.ok) throw new Error('Falha ao excluir (HTTP ' + r.status + ').');
        M.dados.bi_mensal = M.cole('bi_mensal').filter(x => x.id !== id);
        toast('Lançamento excluído.'); M.render();
    },
    sfDet(id) { M._sf = id; M.render(); $('#conteudo').scrollTop = 0; },
    sfVoltar() { M._sf = null; M.render(); },
    sfSub(s) { M._sfSub = s; M.render(); },
    sfChartMode(m) { M._sfChartMode = m; M.render(); },
    sfImporta() {
        toast('A importação de PDFs é feita no desktop — os demonstrativos sincronizam aqui automaticamente.');
    },
    abrirEmpresa(id) { M._emp = id; M.render(); $('#conteudo').scrollTop = 0; },
    buscar(v) {
        M._busca = v.toLowerCase();
        const el = document.querySelector('#lista-emp');
        if (el) el.innerHTML = R._listaEmpresas(); else M.render();
    },
    prazoF(f) { M._prazoF = f; M.render(); },
    tarefasF(f) { M._tarefasF = f; M.render(); },
    async acao(fn, ...a) {
        try { await fn(...a); } catch (e) { toast(e.message || 'Falha ao gravar.', true); }
    },

    toggleEscopo() {
        localStorage.setItem(K_ESCOPO,
            localStorage.getItem(K_ESCOPO) === 'carteira' ? 'total' : 'carteira');
        M.render();
    },
    toggleTema() { M.modalAparencia(true); },
};

/* ---------- helpers de domínio ---------- */
const regimeVigente = (e, data) => {
    const h = data || hojeISO();
    const v = (e?.regimes || []).find(r => (!r.inicio || r.inicio <= h) && (!r.fim || r.fim >= h));
    return v?.regime || e?.regime || '—';
};
const empNome = (id) => M.empresa(id)?.nome || '';
const ativa = (e) => e.ativa !== false && String(e.ativa) !== 'false';
const iniciais = (nome) => (nome || '?').trim().split(/\s+/).slice(0, 2)
    .map(p => p[0]).join('').toUpperCase();
const fmtCpf = (c) => {
    const d = String(c || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '');
};
const fmtMoeda = (v) => (v == null || v === '' || isNaN(+v)) ? '—'
    : (+v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const funcAtivo = (f) => !f.demissao && String(f.situacao || 'ativo').toLowerCase() !== 'demitido';
/* ativo na competência YYYY-MM: admitido até o fim do mês e não demitido antes dele */
const funcAtivoEm = (f, comp) => {
    if (f.admissao && String(f.admissao) > comp + '-31') return false;
    if (f.demissao) return String(f.demissao) >= comp + '-01';
    return String(f.situacao || 'ativo').toLowerCase() !== 'demitido';
};

/* cards do Resumo que alternam sozinhos (a cada 4s):
 * EMPRESAS carteira pessoal ↔ global · FUNCIONÁRIOS ativos ↔ inativos */
function statTicker() {
    clearInterval(M._statTimer); M._statTimer = null;
    const ev = $('#st-emp-v'), es = $('#st-emp-s'), fv = $('#st-fun-v'), fs = $('#st-fun-s');
    if (!ev || !fv) return;
    let alt = false;
    M._statTimer = setInterval(() => {
        alt = !alt;
        const ft = M.filtra('funcionarios');
        const at = ft.filter(funcAtivo).length;
        ev.textContent = alt ? M.cole('empresas').filter(ativa).length
                             : M.filtra('empresas').filter(ativa).length;
        es.textContent = alt ? 'carteira global' : 'carteira pessoal';
        fv.textContent = alt ? ft.length - at : at;
        fs.textContent = alt ? `inativos · ${at} ativo(s)` : `ativos · ${ft.length - at} inativo(s)`;
    }, 4000);
}

/* competência selecionável nos módulos Fiscal/Folha (chips, mais recente 1º) */
function compSel(rows) {
    const comps = [...new Set(rows.map(r => r.competencia).filter(Boolean))].sort().reverse();
    const atual = hojeISO().slice(0, 7);
    if (!comps.includes(atual)) comps.unshift(atual);
    const sel = M._comp && comps.includes(M._comp) ? M._comp : comps[0];
    return { comps: comps.slice(0, 12), sel };
}
const compChips = (comps, sel) => comps.map(c =>
    `<button class="chip ${c === sel ? 'on' : ''}" onclick="M.setComp('${c}')">${c}</button>`).join('');

/* itens unificados da aba Prazos (certidões + certificados + lembretes + guias) */
function itensPrazo() {
    const out = [];
    for (const c of M.filtra('certidoes')) {
        out.push({ tipo: 'certidao', icone: 'fa-file-shield', cor: '#38bdf8',
            titulo: `Certidão ${c.tipo || ''}`, sub: empNome(c.empresa_id),
            data: c.vencimento, dias: diasPara(c.vencimento),
            pendente: c.pendente, id: c.id });
    }
    for (const c of M.filtra('certificados')) {
        out.push({ tipo: 'certificado', icone: 'fa-certificate', cor: '#a78bfa',
            titulo: `Certificado ${c.tipo || 'digital'}${c.titular ? ' · ' + c.titular : ''}`,
            sub: empNome(c.empresa_id), data: c.vencimento,
            dias: diasPara(c.vencimento), id: c.id });
    }
    for (const l of M.filtra('lembretes')) {
        if (l.concluido) continue;
        out.push({ tipo: 'lembrete', icone: 'fa-bell', cor: '#f59e0b',
            titulo: l.titulo, sub: [l.tipo, empNome(l.empresa_id)].filter(Boolean).join(' · '),
            data: l.data || l.prazo, dias: diasPara(l.data || l.prazo), id: l.id, lembrete: true });
    }
    for (const g of M.filtra('guias')) {
        if ((g.status || 'pendente') === 'paga' || g.status === 'emitida') continue;
        out.push({ tipo: 'guia', icone: 'fa-money-check-dollar', cor: '#34d399',
            titulo: `Guia ${g.imposto || ''}`, sub: `${empNome(g.empresa_id)} · ${g.competencia || ''}`,
            data: g.vencimento, dias: diasPara(g.vencimento), id: g.id });
    }
    return out.sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999));
}

const pillData = (dias, data) => {
    if (dias === null) return '<span class="pill neutro">sem data</span>';
    if (dias < 0) return `<span class="pill vencido">vencido há ${-dias}d</span>`;
    if (dias === 0) return '<span class="pill vencido">hoje</span>';
    if (dias <= 7) return `<span class="pill perto">em ${dias}d</span>`;
    if (dias <= 15) return `<span class="pill atencao">em ${dias}d</span>`;
    return `<span class="pill ok">${fmtData(data)}</span>`;
};

/* ==================== RENDERERS ==================== */
const R = {
    /* Panorama: sub-abas Resumo | BI */
    inicio() {
        const sub = M._panSub || 'resumo';
        const corpo = sub === 'bi' ? R.bi() : R.resumo();
        return `<div class="subseg">${[['resumo', 'Resumo'], ['bi', 'BI']]
            .map(([id, n]) => `<button class="${sub === id ? 'on' : ''}" onclick="M.panSub('${id}')">${n}</button>`).join('')}</div>
            ${corpo}`;
    },

    resumo() {
        const u = M.usuario || {};
        const hora = new Date().getHours();
        const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
        const emps = M.filtra('empresas').filter(ativa);
        const certs = M.filtra('certidoes');
        const certsV = certs.filter(c => (diasPara(c.vencimento) ?? 99) < 0).length;
        const certs15 = certs.filter(c => { const d = diasPara(c.vencimento); return d !== null && d >= 0 && d <= 15; }).length;
        const certifs15 = M.filtra('certificados').filter(c => { const d = diasPara(c.vencimento); return d !== null && d <= 15; }).length;
        const lemb = M.filtra('lembretes').filter(l => !l.concluido).length;
        const tar = M.filtra('tarefas').filter(t => (t.coluna || 'afazer') !== 'concluido').length;
        const proximos = itensPrazo().filter(i => (i.dias ?? 99) <= 15).slice(0, 8);
        const funcsT = M.filtra('funcionarios');
        const funcsAt = funcsT.filter(funcAtivo).length;
        const empsG = M.cole('empresas').filter(ativa).length;
        const prox = itensPrazo()[0];
        const admin = u.papel === 'admin';
        const ano = String(new Date().getFullYear());
        const fatAno = M.filtra('bi_mensal')
            .filter(x => String(x.competencia || '').startsWith(ano))
            .reduce((s, x) => s + (+x.faturamento || 0), 0);
        return `
        <div class="hero">
            <div class="hero-avatar">${iniciais(u.nome)}</div>
            <div class="hero-info"><b>${esc(u.nome || '—')}</b>
                <span>${fmtCpf(u.cpf)}</span><br>
                <span class="hero-badge ${admin ? '' : 'colab'}">${admin ? 'ADMINISTRADOR' : 'COLABORADOR'}</span></div>
            <button class="hero-sair" onclick="M.sair()">Sair</button>
        </div>
        <div class="ola"><b>${saud}, ${esc(u.nome?.split(' ')[0] || 'usuário')}!</b>
            <p>O que você deseja gerenciar hoje?</p></div>
        ${prox ? `
        <div class="card-destaque" onclick="M.aba('prazos')">
            <span class="ic" style="color:${prox.cor}"><i class="fa-solid ${prox.icone}"></i></span>
            <div class="cd-txt"><span>PRÓXIMO VENCIMENTO</span>
                <b>${esc(prox.titulo)}</b>
                <small>${esc(prox.sub || '')}</small></div>
            ${pillData(prox.dias, prox.data)}
        </div>` : `
        <div class="card-destaque"><span class="ic" style="color:var(--ok)"><i class="fa-solid fa-circle-check"></i></span>
            <div class="cd-txt"><span>PRAZOS</span><b>Tudo em dia</b>
            <small>nenhum vencimento próximo</small></div></div>`}
        <div class="stats">
            <div class="stat" onclick="M.aba('empresas')"><div class="stat-titulo">EMPRESAS</div>
                <div class="stat-valor" id="st-emp-v">${emps.length}</div>
                <div class="stat-sub" id="st-emp-s">carteira pessoal</div></div>
            <div class="stat"><div class="stat-titulo">FUNCIONÁRIOS</div>
                <div class="stat-valor" id="st-fun-v">${funcsAt}</div>
                <div class="stat-sub" id="st-fun-s">ativos · ${funcsT.length - funcsAt} inativo(s)</div></div>
            <div class="stat" onclick="M.aba('prazos')"><div class="stat-titulo">PRAZOS ≤15 DIAS</div>
                <div class="stat-valor">${certsV + certs15 + certifs15}</div>
                <div class="stat-sub">certidões e certificados</div></div>
            <div class="stat" onclick="M.aba('prazos')"><div class="stat-titulo">TAREFAS ABERTAS</div>
                <div class="stat-valor">${tar}</div>
                <div class="stat-sub">pendentes no quadro</div></div>
        </div>
        ${fatAno > 0 ? `
        <div class="card-destaque" onclick="M.panSub('bi')">
            <span class="ic" style="color:#f59e0b"><i class="fa-solid fa-chart-column"></i></span>
            <div class="cd-txt"><span>FATURAMENTO DA CARTEIRA · ${ano}</span>
                <b>${fmtMoeda(fatAno)}</b>
                <small>toque para abrir o BI</small></div>
        </div>` : ''}
        <div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-calendar-day"></i> Próximos vencimentos</h3>
                <button class="link" onclick="M.aba('prazos')">ver todos</button></div>
            ${proximos.length === 0
                ? '<div class="vazio"><i class="fa-regular fa-circle-check"></i> Nada vencendo nos próximos 15 dias.</div>'
                : proximos.map(itemLinha).join('')}
        </div>`;
    },

    empresas() {
        return `
        <div class="busca"><i class="fa-solid fa-magnifying-glass"></i>
            <input placeholder="Buscar empresa, CNPJ, cidade…" value="${esc(M._busca)}"
                oninput="M.buscar(this.value)"></div>
        <div id="lista-emp">${R._listaEmpresas()}</div>`;
    },

    _listaEmpresas() {
        const lista = M.filtra('empresas')
            .filter(e => !M._busca || (e.nome + ' ' + (e.cnpj || '') + ' ' + (e.municipio || ''))
                .toLowerCase().includes(M._busca))
            .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
        return `${lista.length === 0 ? '<div class="vazio"><i class="fa-regular fa-building"></i> Nenhuma empresa no escopo.</div>'
            : '<div class="card lista-emp">' + lista.map(e => {
                const ncert = M.cole('certidoes').filter(c => c.empresa_id === e.id
                    && (diasPara(c.vencimento) ?? 99) <= 15).length;
                return `<button class="linha-emp ${!ativa(e) ? 'inativa' : ''}" onclick="M.abrirEmpresa('${e.id}')">
                    <div class="linha-ico"><i class="fa-solid fa-building"></i></div>
                    <div class="linha-txt">
                        <b>${esc(e.nome)}</b>
                        <span>${esc(regimeVigente(e))}${e.municipio ? ' · ' + esc(e.municipio) : ''}${!ativa(e) ? ' · inativa' : ''}</span>
                    </div>
                    ${ncert ? `<span class="pill vencido">${ncert}</span>` : ''}
                    <i class="fa-solid fa-chevron-right seta"></i>
                </button>`;}).join('') + '</div>'}`;
    },

    empresaDetalhe(id) {
        const e = M.empresa(id);
        if (!e) { M._emp = null; return R.empresas(); }
        const certs = M.cole('certidoes').filter(c => c.empresa_id === id);
        const certifs = M.cole('certificados').filter(c => c.empresa_id === id);
        const sit = M.cole('situacao_fiscal').filter(s => s.empresa_id === id)
            .sort((a, b) => String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')))[0];
        const funcs = M.cole('funcionarios').filter(f => f.empresa_id === id && !f.demissao);
        const fisc = M.cole('fiscal_status').filter(f => f.empresa_id === id && f.competencia === compAtual());
        const obgs = M.cole('fiscal_obrigacoes');
        const entregues = fisc.filter(f => f.status === 'entregue').length;
        const hist = (e.regimes || []).slice().sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || '')));
        const ano = M._empAno || new Date().getFullYear();
        const biTodos = M.cole('bi_mensal').filter(x => x.empresa_id === id)
            .sort((a, b) => String(b.competencia || '').localeCompare(String(a.competencia || '')));
        const biAno = biTodos.filter(x => String(x.competencia || '').startsWith(ano + '-'));
        const fatAno = biAno.reduce((s, x) => s + (+x.faturamento || 0), 0);
        const mesesLanc = biAno.filter(x => x.faturamento != null || x.funcionarios != null).length;
        const ultBi = biTodos[0];
        const podeBi = M.pode('empresas');
        const compLab = c => {
            const [a, m] = String(c).split('-');
            return `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+m - 1]}/${a}`;
        };

        return `
        <button class="voltar" onclick="M.voltarEmpresa()"><i class="fa-solid fa-arrow-left"></i> Empresas</button>
        <div class="card emp-cab">
            <h2>${esc(e.nome)}</h2>
            <p>${esc(e.cnpj || 'sem CNPJ')}${e.municipio ? ' · ' + esc(e.municipio) + '/' + esc(e.uf || '') : ''}</p>
            ${e.endereco ? `<p>${esc([e.endereco, e.numero].filter(Boolean).join(', '))}${e.bairro ? ' — ' + esc(e.bairro) : ''}</p>` : ''}
            <div class="pills">
                <span class="pill ${ativa(e) ? 'ok' : 'neutro'}">${ativa(e) ? 'ativa' : 'inativa'}</span>
                <span class="pill info">${esc(regimeVigente(e))}</span>
                ${sit ? `<span class="pill ${sit.situacao === 'regular' ? 'ok' : 'vencido'}">${esc(sit.situacao || 'situação?')}</span>` : ''}
            </div>
        </div>
        <div class="grid-cards">
            <div class="mini-card"><i class="fa-solid fa-users" style="color:#34d399"></i>
                <b>${funcs.length}</b><span>Funcionários</span></div>
            <div class="mini-card"><i class="fa-solid fa-file-invoice" style="color:#f59e0b"></i>
                <b>${entregues}/${Math.max(fisc.length, obgs.length || fisc.length)}</b><span>Obrigações mês</span></div>
        </div>
        <div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-chart-column" style="color:#f59e0b"></i> BI — faturamento</h3>
                <div class="seg">
                    <button onclick="M.empAno(-1)"><i class="fa-solid fa-chevron-left"></i></button>
                    <button class="on" style="pointer-events:none">${ano}</button>
                    <button onclick="M.empAno(1)"><i class="fa-solid fa-chevron-right"></i></button>
                </div></div>
            ${biTodos.length || podeBi ? `
            <div class="sf-kpis">
                <div class="stat"><div class="stat-titulo">Faturamento ${ano}</div>
                    <div class="stat-valor" style="font-size:17px">${fmtMoeda(fatAno)}</div></div>
                <div class="stat"><div class="stat-titulo">Média mensal</div>
                    <div class="stat-valor" style="font-size:17px">${fmtMoeda(mesesLanc ? fatAno / mesesLanc : 0)}</div></div>
                <div class="stat"><div class="stat-titulo">Funcionários</div>
                    <div class="stat-valor">${ultBi?.funcionarios ?? '—'}</div>
                    <div class="stat-sub">${ultBi ? 'em ' + compLab(ultBi.competencia) : 'últ. lançamento'}</div></div>
                <div class="stat"><div class="stat-titulo">Meses</div>
                    <div class="stat-valor">${mesesLanc}</div><div class="stat-sub">lançados em ${ano}</div></div>
            </div>
            ${window.Chart ? `
                <div class="sf-sec" style="border:0;padding-top:2px;margin-top:0">Faturamento mensal</div>
                <div class="bi-chart" style="height:170px"><canvas id="bi-emp-fat"></canvas></div>
                <div class="sf-sec">Funcionários por mês</div>
                <div class="bi-chart" style="height:150px"><canvas id="bi-emp-fun"></canvas></div>`
            : '<div class="vazio">Gráficos precisam de conexão na primeira carga.</div>'}
            ${podeBi ? `<div class="sf-sec">Lançamento mensal</div>
            <div class="bi-form">
                <input type="month" id="bi-comp" value="${compAtual()}">
                <input id="bi-fat-in" inputmode="decimal" placeholder="Faturamento (R$)">
                <input id="bi-fun-in" inputmode="numeric" placeholder="Nº funcionários">
                <button onclick="M.acao(M.salvarBi)"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
            </div>` : ''}
            ${biTodos.length ? `<div class="tb-wrap"><table class="tbm">
                <thead><tr><th>Competência</th><th style="text-align:right">Faturamento</th><th style="text-align:right">Funcionários</th>${podeBi ? '<th></th>' : ''}</tr></thead>
                <tbody>${biTodos.slice(0, 18).map(x => `<tr>
                    <td>${compLab(x.competencia)}</td>
                    <td style="text-align:right">${fmtMoeda(x.faturamento)}</td>
                    <td style="text-align:right">${x.funcionarios ?? '—'}</td>
                    ${podeBi ? `<td style="text-align:right"><button class="sf-btn" style="padding:5px 8px" onclick="M.acao(M.excluirBi,'${x.id}')"><i class="fa-solid fa-trash"></i></button></td>` : ''}
                </tr>`).join('')}
                ${biTodos.length > 18 ? `<tr><td colspan="4" class="diag">… e mais ${biTodos.length - 18} lançamento(s)</td></tr>` : ''}</tbody>
            </table></div>` : ''}`
            : '<div class="vazio">Sem lançamentos de faturamento.</div>'}
        </div>
        <div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-file-shield"></i> Certidões</h3></div>
            ${certs.length === 0 ? '<div class="vazio">Nenhuma registrada.</div>'
                : certs.map(c => `<div class="linha">
                    <span class="ic ic-sm" style="color:#38bdf8"><i class="fa-solid fa-file-shield"></i></span>
                    <div class="linha-txt"><b>${esc(c.tipo)}</b><span>${c.pendente ? 'com pendências' : (c.numero ? 'nº ' + esc(c.numero) : '')}${c.via_matriz ? ' · via matriz' : ''}</span></div>
                    ${pillData(diasPara(c.vencimento), c.vencimento)}</div>`).join('')}
        </div>
        <div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-certificate"></i> Certificados digitais</h3></div>
            ${certifs.length === 0 ? '<div class="vazio">Nenhum registrado.</div>'
                : certifs.map(c => `<div class="linha">
                    <span class="ic ic-sm" style="color:#a78bfa"><i class="fa-solid fa-certificate"></i></span>
                    <div class="linha-txt"><b>${esc(c.tipo || 'e-CNPJ')}</b><span>${esc(c.titular || '')}</span></div>
                    ${pillData(diasPara(c.vencimento), c.vencimento)}</div>`).join('')}
        </div>
        ${sit ? `<div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-scale-balanced"></i> Situação fiscal</h3></div>
            <div class="kv"><span>Situação</span><b>${esc(sit.situacao || '—')}</b></div>
            ${sit.diagnostico ? `<div class="kv"><span>Diagnóstico</span><b>${esc(sit.diagnostico)}</b></div>` : ''}
            ${sit.total_debitos ? `<div class="kv"><span>Débitos</span><b>R$ ${Number(sit.total_debitos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b></div>` : ''}
            ${sit.atualizado_em ? `<div class="kv"><span>Atualizado</span><b>${esc(sit.atualizado_em)}</b></div>` : ''}
        </div>` : ''}
        ${hist.length ? `<div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-clock-rotate-left"></i> Histórico de regime</h3></div>
            ${hist.map(r => `<div class="linha"><span class="ic ic-sm" style="color:#f59e0b"><i class="fa-solid fa-bookmark"></i></span>
                <div class="linha-txt"><b>${esc(r.regime)}</b><span>${fmtData(r.inicio)} → ${r.fim ? fmtData(r.fim) : 'atual'}</span></div></div>`).join('')}
        </div>` : ''}`;
    },

    /* módulo grande: Vencimentos | Documentos | Tarefas */
    prazos() {
        const sub = M._pzSub || 'venc';
        const corpo = sub === 'docs' ? R.documentos()
            : sub === 'tar' ? R.tarefas() : R.vencimentos();
        const subs = [['venc', 'Vencimentos'], ['docs', 'Documentos'], ['tar', 'Tarefas']];
        return `<div class="subseg">${subs.map(([id, n]) =>
            `<button class="${sub === id ? 'on' : ''}" onclick="M.pzSub('${id}')">${n}</button>`).join('')}</div>
            ${corpo}`;
    },

    fiscal() {
        const obrig = M.cole('fiscal_obrigacoes');
        const rows0 = M.filtra('fiscal_status');
        const { comps, sel } = compSel(rows0);
        const rows = rows0.filter(r => r.competencia === sel);
        const nomeObr = id => obrig.find(o => o.id === id)?.nome || id || 'Obrigação';
        const porObr = {};
        for (const r of rows) (porObr[r.obrigacao_id] ||= []).push(r);
        const ids = obrig.length ? obrig.map(o => o.id) : Object.keys(porObr);
        const nPend = rows.filter(r => (r.status || 'pendente') === 'pendente').length;
        return `
        <div class="chips">${compChips(comps, sel)}</div>
        <div class="stats">
            <div class="stat"><div class="stat-titulo">PENDENTES</div>
                <div class="stat-valor" style="color:var(--perigo)">${nPend}</div>
                <div class="stat-sub">obrigações em ${esc(sel)}</div></div>
            <div class="stat"><div class="stat-titulo">ENTREGUES</div>
                <div class="stat-valor" style="color:var(--ok)">${rows.length - nPend}</div>
                <div class="stat-sub">de ${rows.length} marcadas</div></div>
        </div>
        ${ids.length === 0
            ? '<div class="vazio"><i class="fa-regular fa-file-lines"></i> Nenhuma obrigação cadastrada.</div>'
            : ids.map(oid => {
                const rs = porObr[oid] || [];
                const pend = rs.filter(r => (r.status || 'pendente') === 'pendente');
                return `<div class="card">
                    <div class="card-head"><h3>${esc(nomeObr(oid))}</h3>
                        <span class="pill ${pend.length ? 'atencao' : 'ok'}">${rs.length - pend.length}/${rs.length} entregues</span></div>
                    ${rs.length === 0
                        ? '<div class="vazio">Nenhuma marcação nesta competência.</div>'
                        : pend.length === 0
                            ? '<div class="vazio"><i class="fa-regular fa-circle-check"></i> Tudo entregue.</div>'
                            : pend.map(r => `<div class="linha">
                                <span class="ic ic-sm" style="color:var(--perigo)"><i class="fa-solid fa-hourglass-half"></i></span>
                                <div class="linha-txt"><b>${esc(empNome(r.empresa_id))}</b>
                                <span>pendente${r.por ? ' · ' + esc(r.por) : ''}</span></div></div>`).join('')}
                </div>`;
            }).join('')}`;
    },

    folha() {
        const fech = M.filtra('folha_fechamentos');
        const { comps, sel } = compSel(fech);
        const rows = fech.filter(r => r.competencia === sel);
        const funcs = M.filtra('funcionarios');
        const bi = M.filtra('bi_mensal');
        /* efetivo por competência: prefere o lançado no BI (folha real);
           sem lançamento, estima pelo cadastro (admitidos - demitidos) */
        const nAtivos = id => {
            const b = bi.find(x => x.empresa_id === id && x.competencia === sel);
            if (b && b.funcionarios != null) return +b.funcionarios;
            return funcs.filter(f => f.empresa_id === id && funcAtivoEm(f, sel)).length;
        };
        const temBi = rows.some(r => {
            const b = bi.find(x => x.empresa_id === r.empresa_id && x.competencia === sel);
            return b && b.funcionarios != null;
        });
        const nPend = rows.filter(r => (r.status || 'pendente') !== 'fechado').length;
        return `
        <div class="chips">${compChips(comps, sel)}</div>
        <div class="stats">
            <div class="stat"><div class="stat-titulo">FUNCIONÁRIOS</div>
                <div class="stat-valor">${rows.reduce((s, r) => s + nAtivos(r.empresa_id), 0)}</div>
                <div class="stat-sub">${temBi ? 'lançados em' : 'ativos em'} ${esc(sel)}</div></div>
            <div class="stat"><div class="stat-titulo">FECHAMENTOS</div>
                <div class="stat-valor" style="color:${nPend ? 'var(--perigo)' : 'var(--ok)'}">${rows.length - nPend}/${rows.length}</div>
                <div class="stat-sub">fechados em ${esc(sel)}</div></div>
        </div>
        ${rows.length === 0
            ? '<div class="vazio"><i class="fa-regular fa-calendar-check"></i> Nenhum fechamento nesta competência.</div>'
            : '<div class="card lista-emp">' + rows.map(r => {
                const ok = (r.status || 'pendente') === 'fechado';
                return `<div class="linha">
                    <span class="ic ic-sm" style="color:${ok ? 'var(--ok)' : 'var(--perigo)'}"><i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-hourglass-half'}"></i></span>
                    <div class="linha-txt"><b>${esc(empNome(r.empresa_id))}</b>
                    <span>${nAtivos(r.empresa_id)} funcionário(s)${r.por ? ' · ' + esc(r.por) : ''}</span></div>
                    <span class="pill ${ok ? 'ok' : 'atencao'}">${esc(r.status || 'pendente')}</span></div>`;
            }).join('') + '</div>'}`;
    },

    situacao() {
        if (M._sf) return R.situacaoDet(M._sf);
        const regs = M.filtra('situacao_fiscal');
        const emps = M.filtra('empresas').filter(ativa);
        const divida = regs.reduce((s, x) => s + (+x.total_debitos || 0), 0);
        const comDeb = new Set(regs.filter(x => (x.qtd_debitos || 0) > 0).map(x => x.empresa_id)).size;
        const nDeb = regs.reduce((s, x) => s + (x.qtd_debitos || 0), 0);
        const nOm = regs.reduce((s, x) => s + (x.omissoes || []).filter(o => o.status === 'ok').length, 0);
        const nPr = regs.reduce((s, x) => s + (x.processos || []).length, 0);
        const semRel = emps.filter(e => !regs.some(x => x.empresa_id === e.id));
        const modo = M._sfChartMode || 'empresa';
        const porEmp = {};
        regs.forEach(s => porEmp[s.empresa_id] = (porEmp[s.empresa_id] || 0) + (+s.total_debitos || 0));
        const nBars = modo === 'ente'
            ? [...new Set(regs.map(s => s.origem))].length
            : Object.values(porEmp).filter(v => v > 0).length;

        const barra = `<div class="sf-bar">
            <button class="sf-btn ${(M._sfSub || 'lista') === 'lista' ? 'on' : ''}" onclick="M.sfSub('lista')">
                <i class="fa-solid fa-file-shield"></i> Demonstrativos <b class="bdg">${regs.length}</b></button>
            <button class="sf-btn ${M._sfSub === 'cob' ? 'on' : ''}" onclick="M.sfSub('cob')">
                <i class="fa-solid fa-calendar-check"></i> Cobertura
                <b class="bdg ${semRel.length ? 'warn' : ''}">${semRel.length ? semRel.length + ' sem relatório' : 'em dia'}</b></button>
            <span class="sf-sep">Importar:</span>
            <button class="sf-btn" onclick="M.sfImporta()"><i class="fa-solid fa-file-arrow-up" style="color:#34d399"></i> DSOT/SEFAZ</button>
            <button class="sf-btn" onclick="M.sfImporta()"><i class="fa-solid fa-file-arrow-up" style="color:#a78bfa"></i> Receita/PGFN</button>
        </div>`;

        const panorama = barra + `
            <div class="sf-kpis">
                <div class="stat"><div class="stat-titulo">Dívida global</div>
                    <div class="stat-valor" style="color:#f87171;font-size:18px">${fmtMoeda(divida)}</div>
                    <div class="stat-sub">empresas da carteira</div></div>
                <div class="stat"><div class="stat-titulo">Com débitos</div>
                    <div class="stat-valor">${comDeb}</div><div class="stat-sub">empresa(s)</div></div>
                <div class="stat"><div class="stat-titulo">Débitos</div>
                    <div class="stat-valor">${nDeb}</div><div class="stat-sub">listados</div></div>
                <div class="stat"><div class="stat-titulo">Omissões</div>
                    <div class="stat-valor">${nOm}</div><div class="stat-sub">pendentes</div></div>
                <div class="stat"><div class="stat-titulo">Processos</div>
                    <div class="stat-valor">${nPr}</div><div class="stat-sub">em tramitação</div></div>
            </div>
            ${nBars ? `<div class="card">
                <div class="card-head"><h3><i class="fa-solid fa-chart-column" style="color:#f87171"></i>
                    Dívida ${modo === 'ente' ? 'por ente' : 'por empresa'}</h3>
                    <span class="seg">
                        <button class="${modo === 'empresa' ? 'on' : ''}" onclick="M.sfChartMode('empresa')">Empresa</button>
                        <button class="${modo === 'ente' ? 'on' : ''}" onclick="M.sfChartMode('ente')">Ente</button>
                    </span></div>
                ${window.Chart ? `<div class="bi-chart" style="height:${Math.max(150, 44 + nBars * 34)}px"><canvas id="sf-chart"></canvas></div>`
                : '<div class="vazio">Gráfico precisa de conexão na primeira carga.</div>'}</div>` : ''}`;

        if (M._sfSub === 'cob') {
            return panorama + `<p class="ap-sub" style="margin:0 2px 10px">Empresas da carteira sem demonstrativo importado — toque para abrir a ficha.</p>` +
                (semRel.length ? '<div class="card lista-emp">' + semRel.map(e => `<button class="linha-emp" onclick="M.abrirEmpresa('${e.id}')">
                    <div class="linha-ico"><i class="fa-solid fa-building"></i></div>
                    <div class="linha-txt"><b>${esc(e.nome)}</b><span>${esc(e.cnpj || '—')} · ${esc(regimeVigente(e))}</span></div>
                    <span class="pill vencido">sem relatório</span>
                    <i class="fa-solid fa-chevron-right seta"></i></button>`).join('') + '</div>'
                : '<div class="vazio"><i class="fa-solid fa-circle-check"></i> Todas as empresas da carteira têm demonstrativo.</div>');
        }

        if (!regs.length)
            return panorama + '<div class="vazio"><i class="fa-solid fa-scale-balanced"></i> Nenhum diagnóstico fiscal importado — a importação de PDFs é feita no desktop.</div>';
        const grupos = {};
        regs.forEach(s => (grupos[s.empresa_id] = grupos[s.empresa_id] || []).push(s));
        const ult = arr => arr.slice().sort((a, b) =>
            String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')))[0];
        const cards = Object.entries(grupos).sort((a, b) =>
            empNome(a[0]).localeCompare(empNome(b[0]))).map(([eid, recs]) => {
            const dsot = ult(recs.filter(x => x.origem !== 'receita'));
            const rec = ult(recs.filter(x => x.origem === 'receita'));
            const s = dsot || rec;
            const sit = String(s?.situacao || '');
            const ok = ['ATIVO', 'ATIVA', 'REGULAR'].includes(sit.toUpperCase());
            const linEst = dsot ? `Estadual/DSOT: ${esc(sit || '—')}` +
                (dsot.qtd_debitos ? ` · ${dsot.qtd_debitos} déb. ${fmtMoeda(dsot.total_debitos)}` : ' · nada consta') : '';
            const linFed = rec ? `Federal/Receita: ${rec.diagnostico === 'limpa' ? 'sem pendências'
                : (rec.qtd_debitos ?? (rec.pendencias || []).length ?? 0) + ' pendência(s)'}` : '';
            return `<button class="linha-emp" onclick="M.sfDet('${eid}')">
                <div class="linha-ico" style="color:#a78bfa"><i class="fa-solid fa-scale-balanced"></i></div>
                <div class="linha-txt"><b>${esc(s?.nome_doc || empNome(eid))}</b>
                    <span>${[linEst, linFed].filter(Boolean).join('<br>') || esc(sit || '—')}</span></div>
                <span class="pill ${ok ? 'ok' : 'vencido'}">${esc(sit || '—')}</span>
                <i class="fa-solid fa-chevron-right seta"></i></button>`;
        }).join('');
        return panorama + `<p class="ap-sub" style="margin:0 2px 10px">Toque na empresa para ver o detalhamento por ente — Estadual (DSOT) e Federal (Receita/PGFN).</p>`
            + `<div class="card lista-emp">${cards}</div>`;
    },

    /* detalhe por empresa — mesmas separações do desktop:
       Estadual (DSOT/SEFAZ) e Federal (Receita/PGFN) com seções,
       débitos, obrigações acessórias, processos e espelho do documento */
    situacaoDet(eid) {
        const recs = M.cole('situacao_fiscal').filter(x => x.empresa_id === eid)
            .sort((a, b) => (a.origem === 'receita' ? 1 : 0) - (b.origem === 'receita' ? 1 : 0));
        const e = M.empresa(eid);
        if (!recs.length) { M._sf = null; return R.situacao(); }
        const tb = (cols, rows) => `<div class="tb-wrap"><table class="tbm">
            <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        const bloco = (icone, cor, titulo, inner) => `<div class="card">
            <div class="card-head"><h3><i class="fa-solid ${icone}" style="color:${cor}"></i> ${titulo}</h3></div>${inner}</div>`;

        const blocoDsot = (s) => {
            const secoes = (s.secoes || []).filter(x => x.debitos?.length);
            const omissoes = s.omissoes || [];
            const processos = s.processos || [];
            return bloco('fa-landmark', '#34d399',
                `Estadual — DSOT/SEFAZ${s.atualizado_em ? ` <small>até ${fmtData(s.atualizado_em)}</small>` : ''}`, `
                <div class="kv"><span>Situação / regime</span><b>${esc(s.situacao || '—')}${s.regime ? ' · ' + esc(s.regime) : ''}</b></div>
                <div class="kv"><span>Dívida total (c/ acréscimos)</span><b style="color:var(--perigo)">${fmtMoeda(s.total_debitos || 0)}</b></div>
                ${s.acrescimos_ate ? `<div class="kv"><span>Acréscimos até</span><b>${fmtData(s.acrescimos_ate)}</b></div>` : ''}
                ${secoes.map(sec => `<div class="sf-sec">${esc(sec.nome)} — ${sec.debitos.length} débito(s) · ${fmtMoeda(sec.total)}</div>
                    ${tb(['Ref.', 'Receita', 'NF', 'Principal', 'Multa', 'Juros', 'Corr.', 'Total', 'Susp.'],
                        sec.debitos.map(d => [esc(d.referencia), esc(d.receita), esc(d.nf),
                            fmtMoeda(d.principal), fmtMoeda(d.multa), fmtMoeda(d.juros),
                            fmtMoeda(d.correcao), `<b>${fmtMoeda(d.total)}</b>`, esc(d.suspensao || '')]))}`).join('')
                    || '<p class="diag">Nenhuma seção com débitos — NADA CONSTA em todas.</p>'}
                ${(s.secoes_limpas || []).map(n => `<div class="sf-sec">${esc(n)}</div><div class="diag" style="color:var(--ok)">NADA CONSTA</div>`).join('')}
                ${omissoes.length ? `<div class="sf-sec">Obrigações acessórias</div>
                    <div class="pills">${omissoes.map(o => `<span class="pill ${o.status === 'ok' ? 'atencao' : 'ok'}"
                        >${esc(o.nome)}${o.status === 'ok' ? ` (${(o.pendencias || []).length || 0})` : ''}</span>`).join('')}</div>
                    ${omissoes.filter(o => (o.pendencias || []).length).map(o =>
                        `<div class="diag">${esc(o.nome)}: ${o.pendencias.map(esc).join(', ')}</div>`).join('')}` : ''}
                ${processos.length ? `<div class="sf-sec">Processos em tramitação</div>
                    ${tb(['Processo', 'Origem', 'Data', 'Fase', 'Valor'],
                        processos.map(pr => [esc(pr.numero), esc(pr.origem || '—'), esc(pr.data || '—'),
                            esc(pr.fase || '—'), `<b>${fmtMoeda(pr.valor_total)}</b>`]))}` : ''}
                <details class="esp"><summary><i class="fa-solid fa-file-lines"></i> Espelho do demonstrativo</summary>
                    <div class="esp-doc">
                        <b>${esc(s.nome_doc || e?.nome || '')}</b><br>
                        <span class="diag">CNPJ ${esc(s.cnpj || e?.cnpj || '—')}${s.ie ? ' · IE ' + esc(s.ie) : ''} · ${esc(s.situacao || '—')}${s.regime ? ' · ' + esc(s.regime) : ''}</span><br>
                        <span class="diag">Demonstrativo de Situação de Obrigações Tributárias — dados até ${fmtData(s.atualizado_em)}${s.acrescimos_ate ? ' · acréscimos até ' + fmtData(s.acrescimos_ate) : ''}</span>
                        ${(s.secoes || []).map(sec => `<div class="sf-sec">${esc(sec.nome)}</div>
                            ${tb(['Seq', 'Referência', 'Receita', 'nº NF', 'Principal', 'Multa', 'Juros', 'Correção', 'Total', 'Suspensão'],
                                sec.debitos.map(d => [d.seq || '—', esc(d.referencia), esc(d.receita), esc(d.nf),
                                    fmtMoeda(d.principal), fmtMoeda(d.multa), fmtMoeda(d.juros), fmtMoeda(d.correcao),
                                    `<b>${fmtMoeda(d.total)}</b>`, esc(d.suspensao || '')]))}
                            <div class="diag" style="text-align:right">Subtotal: <b>${fmtMoeda(sec.total)}</b></div>`).join('')}
                        ${(s.secoes_limpas || []).map(n => `<div class="sf-sec">${esc(n)}</div><div class="diag" style="color:var(--ok)">NADA CONSTA</div>`).join('')}
                        <div class="sf-sec" style="text-align:center">TOTAL DOS DÉBITOS: <b>${fmtMoeda(s.total_debitos || 0)}</b> — fim do demonstrativo</div>
                    </div></details>`);
        };

        const blocoReceita = (s) => {
            const c = s.certidao;
            const dv = c?.validade ? diasPara(c.validade) : null;
            return bloco('fa-flag', '#a78bfa', 'Federal — Receita/PGFN', `
                <div class="kv"><span>Diagnóstico</span><b>${s.diagnostico === 'limpa' ? 'Sem pendências'
                    : s.diagnostico === 'pendencias' ? 'Pendências encontradas' : 'Indefinido'}</b></div>
                <div class="kv"><span>Situação cadastral</span><b>${esc(s.situacao || '—')}</b></div>
                ${c ? `<div class="kv"><span>Certidão ${esc(c.tipo)}</span><b>${esc(c.numero)}</b></div>
                <div class="kv"><span>Emissão → Validade</span><b>${fmtData(c.emissao)} → ${fmtData(c.validade)}${dv !== null && dv < 0 ? ` <span style="color:var(--perigo)">vencida há ${-dv}d</span>` : dv !== null && dv <= 15 ? ` <span style="color:var(--perigo)">vence em ${dv}d</span>` : ''}</b></div>` : ''}
                ${(s.pendencias_det || []).map(d => {
                    if (d.tipo === 'parcelamento') return `<div class="sf-sec"><i class="fa-solid fa-triangle-exclamation" style="color:var(--prim)"></i> ${esc(d.programa || d.secao)}</div>
                        <p class="diag">Parcelas em atraso: <b style="color:var(--perigo)">${d.parcelas_atraso}</b></p>`;
                    if (d.tipo === 'inscricao') return `<div class="sf-sec"><i class="fa-solid fa-triangle-exclamation" style="color:var(--prim)"></i> ${esc(d.secao)} — ${d.qtd} inscrição(ões)</div>
                        <p class="diag">${(d.itens || []).map(i => esc(i.texto)).join('<br>')}</p>`;
                    if (d.tipo === 'omissao') return `<div class="sf-sec"><i class="fa-solid fa-triangle-exclamation" style="color:var(--prim)"></i> ${esc(d.secao)} — ${d.qtd || (d.itens || []).length} omissão(ões)</div>
                        <p class="diag">${(d.itens || []).map(esc).join(', ')}</p>`;
                    if (d.tipo === 'outros') return `<div class="sf-sec"><i class="fa-solid fa-circle-info" style="color:var(--info)"></i> ${esc(d.secao)}</div>
                        <p class="diag">${(d.linhas || []).map(esc).join('<br>')}</p>`;
                    const av = d.tipo === 'a_vencer';
                    return `<div class="sf-sec"><i class="fa-solid ${av ? 'fa-clock' : 'fa-triangle-exclamation'}" style="color:${av ? 'var(--info)' : 'var(--perigo)'}"></i> ${esc(d.secao)} — ${d.debitos.length} débito(s)${av ? ' a vencer' : ''} · ${fmtMoeda(d.total)}</div>
                        ${tb(['Receita', 'PA', 'Vencimento', 'Saldo dev.', 'Situação'],
                            d.debitos.map(x => [esc(x.receita), x.pa || '—', fmtData(x.vencimento),
                                `<b>${fmtMoeda(x.saldo)}</b>`, esc(x.situacao || '—')]))}`;
                }).join('')
                || ((s.pendencias || []).length ? `<div class="diag">${s.pendencias.map(esc).join('<br>')}</div>` : '')}
                <details class="esp"><summary><i class="fa-solid fa-file-lines"></i> Espelho do relatório</summary>
                    <div class="esp-doc">
                        <b>${esc(s.nome_doc || e?.nome || '')}</b><br>
                        <span class="diag">${esc(s.cnpj || e?.cnpj || '—')} · situação cadastral ${esc(s.situacao || '—')}</span><br>
                        <span class="diag">Relatório de Situação Fiscal — Receita Federal/PGFN · emitido em ${fmtData(s.atualizado_em)}</span>
                        ${c ? `<div class="sf-sec">Certidão emitida</div>
                            <div class="diag">Certidão ${esc(c.tipo)} · nº ${esc(c.numero)} · emissão ${fmtData(c.emissao)} · validade ${fmtData(c.validade)}</div>` : ''}
                        <div class="sf-sec">Diagnóstico fiscal</div>
                        ${s.diagnostico === 'limpa' ? '<div class="diag" style="color:var(--ok)">Não foram detectadas pendências nas bases de dados.</div>' : ''}
                        ${(s.pendencias_det || []).map(d => {
                            if (d.tipo === 'parcelamento') return `<div class="diag"><b>${esc(d.programa || d.secao)}</b> — parcelas em atraso: <b>${d.parcelas_atraso}</b></div>`;
                            if (d.tipo === 'inscricao') return `<div class="diag"><b>${esc(d.secao)}</b> — ${d.qtd} inscrição(ões)<br>${(d.itens || []).map(i => esc(i.texto)).join('<br>')}</div>`;
                            if (d.tipo === 'omissao') return `<div class="diag"><b>${esc(d.secao)}</b> — ${d.qtd || (d.itens || []).length} omissão(ões): ${(d.itens || []).map(esc).join(', ')}</div>`;
                            if (d.tipo === 'outros') return `<div class="diag"><b>${esc(d.secao)}</b><br>${(d.linhas || []).map(esc).join('<br>')}</div>`;
                            const av = d.tipo === 'a_vencer';
                            return `<div class="diag"><b>${esc(d.secao)}</b> — ${d.debitos.length} débito(s)${av ? ' (exigibilidade suspensa · a vencer)' : ''} · ${fmtMoeda(d.total)}</div>
                                ${tb(['Receita', 'PA', 'Vencimento', 'Saldo dev.', 'Situação', 'Notificação'],
                                    d.debitos.map(x => [esc(x.receita), x.pa || '—', fmtData(x.vencimento),
                                        `<b>${fmtMoeda(x.saldo)}</b>`, esc(x.situacao || '—'), esc(x.notificacao || '—')]))}`;
                        }).join('')}
                        <div class="sf-sec" style="text-align:center">Fim do relatório</div>
                    </div></details>`);
        };

        return `
        <button class="voltar" onclick="M.sfVoltar()"><i class="fa-solid fa-arrow-left"></i> Situação fiscal</button>
        <div class="card emp-cab">
            <h2>${esc(e?.nome || recs[0].nome_doc || '')}</h2>
            <p>${esc(e?.cnpj || recs[0].cnpj || '—')}${e?.municipio ? ' · ' + esc(e.municipio) + '/' + esc(e.uf || '') : ''}</p>
        </div>
        ${recs.map(s => s.origem === 'receita' ? blocoReceita(s) : blocoDsot(s)).join('')}`;
    },

    documentos() {
        const certs = M.filtra('certidoes');
        const certifs = M.filtra('certificados');
        const li = (icone, cor, titulo, sub, venc) => `<div class="linha">
            <span class="ic ic-sm" style="color:${cor}"><i class="fa-solid ${icone}"></i></span>
            <div class="linha-txt"><b>${esc(titulo)}</b><span>${sub}</span></div>
            ${pillData(diasPara(venc), venc)}</div>`;
        return `
        <div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-file-shield"></i> Certidões</h3>
                <span class="pill neutro">${certs.length}</span></div>
            ${certs.length === 0 ? '<div class="vazio">Nenhuma certidão.</div>'
                : certs.map(c => li('fa-file-shield', '#38bdf8', `Certidão ${c.tipo || ''}`,
                    [empNome(c.empresa_id), c.numero ? 'nº ' + c.numero : '',
                     c.pendente ? 'com pendência' : ''].filter(Boolean).map(esc).join(' · '),
                    c.vencimento)).join('')}
        </div>
        <div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-certificate"></i> Certificados digitais</h3>
                <span class="pill neutro">${certifs.length}</span></div>
            ${certifs.length === 0 ? '<div class="vazio">Nenhum certificado.</div>'
                : certifs.map(c => li('fa-certificate', '#a78bfa',
                    `Certificado ${c.tipo || 'digital'}${c.titular ? ' · ' + c.titular : ''}`,
                    esc(empNome(c.empresa_id)), c.vencimento)).join('')}
        </div>`;
    },

    /* ---------- BI (estilo desktop: faturamento + funcionários globais) ---------- */
    bi() {
        const bi = M.filtra('bi_mensal');
        if (!bi.length && !window.Chart)
            return '<div class="vazio"><i class="fa-solid fa-chart-column"></i> Sem dados de BI ainda.</div>';
        const ano = String(new Date().getFullYear());
        const doAno = bi.filter(x => String(x.competencia || '').startsWith(ano));
        const fatAno = doAno.reduce((s, x) => s + (+x.faturamento || 0), 0);
        const comps = [...new Set(bi.map(x => x.competencia).filter(Boolean))].sort();
        const ultComp = comps[comps.length - 1];
        const ultFat = bi.filter(x => x.competencia === ultComp)
            .reduce((s, x) => s + (+x.faturamento || 0), 0);
        const nComps = comps.length || 1;
        const funcsAtivos = M.filtra('funcionarios').filter(funcAtivo).length;
        const temFunc = bi.some(x => x.funcionarios != null && +x.funcionarios > 0);
        return `
        <div class="stats">
            <div class="stat"><div class="stat-titulo">FATURAMENTO ${ano}</div>
                <div class="stat-valor" style="font-size:17px">${fmtMoeda(fatAno)}</div>
                <div class="stat-sub">soma da visão atual</div></div>
            <div class="stat"><div class="stat-titulo">MÉDIA MENSAL</div>
                <div class="stat-valor" style="font-size:17px">${fmtMoeda(fatAno / Math.max(nComps, 1))}</div>
                <div class="stat-sub">último mês: ${fmtMoeda(ultFat)}</div></div>
            <div class="stat"><div class="stat-titulo">FUNCIONÁRIOS</div>
                <div class="stat-valor">${funcsAtivos}</div>
                <div class="stat-sub">ativos na visão atual</div></div>
            <div class="stat"><div class="stat-titulo">COMPETÊNCIAS</div>
                <div class="stat-valor">${comps.length}</div>
                <div class="stat-sub">com dados de BI</div></div>
        </div>
        <div class="card"><div class="card-head"><h3><i class="fa-solid fa-chart-column" style="color:#f59e0b"></i> Faturamento global</h3></div>
            ${window.Chart ? '<div class="bi-chart"><canvas id="bi-fat"></canvas></div>' : '<div class="vazio">Gráfico precisa de conexão na primeira carga.</div>'}
        </div>
        ${temFunc ? `<div class="card"><div class="card-head"><h3><i class="fa-solid fa-chart-column" style="color:#38bdf8"></i> Funcionários por competência</h3></div>
            ${window.Chart ? '<div class="bi-chart"><canvas id="bi-func"></canvas></div>' : ''}</div>` : ''}
        <div class="card"><div class="card-head"><h3><i class="fa-solid fa-chart-pie" style="color:#a78bfa"></i> Empresas por regime</h3></div>
            ${window.Chart ? '<div class="bi-chart" style="height:190px"><canvas id="bi-reg"></canvas></div>' : ''}</div>
        <div class="card"><div class="card-head"><h3><i class="fa-solid fa-users" style="color:#34d399"></i> Funcionários por empresa (top 8)</h3></div>
            ${window.Chart ? '<div class="bi-chart" style="height:200px"><canvas id="bi-fempe"></canvas></div>' : ''}</div>`;
    },

    vencimentos() {
        const todos = itensPrazo();
        const f = M._prazoF;
        const lista = f === 'todos' ? todos
            : f === 'vencidos' ? todos.filter(i => (i.dias ?? 99) < 0)
            : f === '7d' ? todos.filter(i => (i.dias ?? 99) >= 0 && i.dias <= 7)
            : f === '15d' ? todos.filter(i => (i.dias ?? 99) >= 0 && i.dias <= 15)
            : todos.filter(i => i.tipo === f);
        const chips = [['todos', 'Todos'], ['vencidos', 'Vencidos'], ['7d', '≤ 7 dias'],
                       ['15d', '≤ 15 dias'], ['certidao', 'Certidões'], ['certificado', 'Certificados'],
                       ['lembrete', 'Lembretes'], ['guia', 'Guias']];
        const pode = M.pode('lembretes');
        return `
        <div class="chips">${chips.map(([v, n]) =>
            `<button class="chip ${f === v ? 'on' : ''}" onclick="M.prazoF('${v}')">${n}</button>`).join('')}</div>
        ${lista.length === 0 ? '<div class="vazio"><i class="fa-regular fa-calendar-check"></i> Nada por aqui.</div>'
            : '<div class="card lista-emp">' + lista.map(i => itemLinha(i, pode)).join('') + '</div>'}`;
    },

    tarefas() {
        const abertas = M.filtra('tarefas').filter(t => (t.coluna || 'afazer') !== 'concluido');
        const feitas = M.filtra('tarefas').filter(t => (t.coluna || 'afazer') === 'concluido');
        const lista = (M._tarefasF === 'abertas' ? abertas : feitas)
            .sort((a, b) => (diasPara(a.prazo) ?? 9999) - (diasPara(b.prazo) ?? 9999));
        const pode = M.pode('tarefas');
        return `
        <div class="chips">
            <button class="chip ${M._tarefasF === 'abertas' ? 'on' : ''}" onclick="M.tarefasF('abertas')">Abertas (${abertas.length})</button>
            <button class="chip ${M._tarefasF === 'feitas' ? 'on' : ''}" onclick="M.tarefasF('feitas')">Concluídas (${feitas.length})</button>
        </div>
        ${lista.length === 0 ? '<div class="vazio"><i class="fa-regular fa-circle-check"></i> Nenhuma tarefa.</div>'
            : '<div class="card lista-emp">' + lista.map(t => {
                const d = diasPara(t.prazo);
                const atrasada = d !== null && d < 0 && (t.coluna || 'afazer') !== 'concluido';
                const feita = (t.coluna || 'afazer') === 'concluido';
                return `<div class="linha tarefa ${feita ? 'feita' : ''}">
                    ${pode ? `<button class="chk ${feita ? 'on' : ''}"
                        onclick="M.acao(M.${feita ? 'reabrirTarefa' : 'concluirTarefa'},'${t.id}')">
                        <i class="fa-solid fa-check"></i></button>` : ''}
                    <div class="linha-txt">
                        <b>${esc(t.titulo)}</b>
                        <span>${[empNome(t.empresa_id), t.responsavel,
                                 t.prazo ? fmtData(t.prazo) + (atrasada ? ` · ${-d}d atrás` : '') : '']
                                .filter(Boolean).map(esc).join(' · ')}</span>
                    </div>
                    ${atrasada ? '<span class="pill vencido">atrasada</span>' : ''}
                </div>`;}).join('') + '</div>'}`;
    },

    perfil() {
        const u = M.usuario || {};
        const escopoCart = localStorage.getItem(K_ESCOPO) === 'carteira';
        const nEmp = M.filtra('empresas').length;
        return `
        <div class="card perfil-cab">
            <div class="avatar"><i class="fa-solid fa-user"></i></div>
            <div><h2>${esc(u.nome || M.sess?.usuario)}</h2>
            <p>${esc({ admin: 'Administrador', gerente: 'Gerente', operador: 'Operador', colaborador: 'Colaborador' }[u.papel] || u.papel || '')}</p></div>
        </div>
        <div class="card lista-emp">
        ${u.papel === 'admin' && Array.isArray(u.empresas) ? `
        <button class="opcao" onclick="M.toggleEscopo()">
            <span class="ic ic-sm" style="color:#f59e0b"><i class="fa-solid fa-briefcase"></i></span>
            <div class="linha-txt"><b>Ver só minha carteira</b>
            <span>${escopoCart ? `sim — ${nEmp} empresa(s)` : 'não — todas as empresas'}</span></div>
            <span class="switch ${escopoCart ? 'on' : ''}"></span></button>` : ''}
        <button class="opcao" onclick="M.modalAparencia(true)">
            <span class="ic ic-sm" style="color:#a78bfa"><i class="fa-solid fa-palette"></i></span>
            <div class="linha-txt"><b>Tema e fundo</b><span>paleta de cores + fundo animado</span></div>
            <i class="fa-solid fa-chevron-right seta"></i></button>
        <button class="opcao" onclick="M.sincronizar(true)">
            <span class="ic ic-sm" style="color:#38bdf8"><i class="fa-solid fa-rotate"></i></span>
            <div class="linha-txt"><b>Sincronizar agora</b><span>buscar dados mais recentes</span></div>
            <i class="fa-solid fa-chevron-right seta"></i></button>
        <button class="opcao" onclick="M.sair()">
            <span class="ic ic-sm" style="color:#ef4444"><i class="fa-solid fa-right-from-bracket"></i></span>
            <div class="linha-txt"><b>Sair da conta</b><span>encerrar sessão neste aparelho</span></div>
            <i class="fa-solid fa-chevron-right seta"></i></button>
        </div>
        <p class="versao-rodape" onclick="navigator.clipboard?.writeText('SGO Mobile v${VERSAO}');toast('Versão copiada.')">
            SG Office Mobile · v${VERSAO}</p>`;
    },
};

/* gráficos do BI — recriados a cada render (canvas novo no DOM) */
function initBiCharts() {
    (M._charts || []).forEach(c => c.destroy()); M._charts = [];
    if (!window.Chart) return;
    const cssVar = (v) => getComputedStyle(document.body).getPropertyValue(v).trim();
    Chart.defaults.color = cssVar('--txt2') || '#9aa7bd';
    Chart.defaults.font.size = 10;
    const grid = { color: (cssVar('--txt3') || '#64748b') + '44' };
    const moeda = (v) => (+v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    const mk = (el, cfg) => el && M._charts.push(new Chart(el, cfg));

    _sfChart(mk, grid, moeda);
    _empChart(mk, grid);
    if (!document.getElementById('bi-fat')) return;

    const bi = M.filtra('bi_mensal');
    const m = {};
    for (const x of bi) {
        if (!x.competencia) continue;
        const a = m[x.competencia] = m[x.competencia] || { fat: 0, fun: 0, temF: false };
        a.fat += (+x.faturamento || 0);
        if (x.funcionarios != null) { a.fun += (+x.funcionarios || 0); a.temF = true; }
    }
    const comps = Object.keys(m).sort().slice(-12);

    if (comps.length) {
        mk($('#bi-fat'), {
            type: 'bar',
            data: { labels: comps, datasets: [{ data: comps.map(c => m[c].fat),
                backgroundColor: '#f59e0bcc', borderRadius: 6 }] },
            options: { plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: (c) => 'R$ ' + moeda(c.parsed.y) } } },
                scales: { x: { grid: { display: false } },
                          y: { grid, ticks: { callback: moeda } } },
                maintainAspectRatio: false } });
        mk($('#bi-func'), {
            type: 'bar',
            data: { labels: comps, datasets: [{ data: comps.map(c => m[c].temF ? m[c].fun : null),
                backgroundColor: '#38bdf8cc', borderRadius: 6 }] },
            options: { plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } },
                          y: { grid, beginAtZero: true, ticks: { precision: 0 } } },
                maintainAspectRatio: false } });
    }

    const elReg = $('#bi-reg');
    if (elReg) {
        const cont = {};
        for (const e of M.filtra('empresas').filter(ativa))
            cont[regimeVigente(e)] = (cont[regimeVigente(e)] || 0) + 1;
        if (Object.keys(cont).length) mk(elReg, {
            type: 'doughnut',
            data: { labels: Object.keys(cont),
                datasets: [{ data: Object.values(cont), borderWidth: 0,
                    backgroundColor: ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fb923c', '#22d3ee'] }] },
            options: { plugins: { legend: { position: 'right' } }, maintainAspectRatio: false } });
    }

    const elFE = $('#bi-fempe');
    if (elFE) {
        const cont = {};
        for (const f of M.filtra('funcionarios').filter(funcAtivo))
            cont[f.empresa_id] = (cont[f.empresa_id] || 0) + 1;
        const top = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (top.length) mk(elFE, {
            type: 'bar',
            data: { labels: top.map(([id]) => (empNome(id) || '?').slice(0, 18)),
                datasets: [{ data: top.map(([, n]) => n), backgroundColor: '#34d399cc', borderRadius: 6 }] },
            options: { indexAxis: 'y', plugins: { legend: { display: false } },
                scales: { x: { grid, beginAtZero: true, ticks: { precision: 0 } },
                          y: { grid: { display: false } } },
                maintainAspectRatio: false } });
    }
}

/* BI por empresa (detalhe) — faturamento e funcionários do ano navegável */
function _empChart(mk, grid) {
    const el = document.getElementById('bi-emp-fat');
    if (!el || !M._emp) return;
    const ano = M._empAno || new Date().getFullYear();
    const regs = M.cole('bi_mensal').filter(x => x.empresa_id === M._emp);
    const lab = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const dados = (campo) => Array.from({ length: 12 }, (_, i) => {
        const r = regs.find(x => x.competencia === `${ano}-${String(i + 1).padStart(2, '0')}`);
        return r && r[campo] != null ? +r[campo] : null;
    });
    mk(el, {
        type: 'bar',
        data: { labels: lab, datasets: [{ data: dados('faturamento'),
            backgroundColor: '#f59e0bcc', borderRadius: 6 }] },
        options: { plugins: { legend: { display: false },
                tooltip: { callbacks: { label: (c) => 'R$ ' + (+c.parsed.y).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) } } },
            scales: { x: { grid: { display: false } },
                      y: { grid, ticks: { callback: (v) => (+v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) } } },
            maintainAspectRatio: false } });
    mk(document.getElementById('bi-emp-fun'), {
        type: 'line',
        data: { labels: lab, datasets: [{ data: dados('funcionarios'),
            borderColor: '#a78bfa', backgroundColor: '#a78bfa33',
            fill: true, tension: .3, pointRadius: 4, spanGaps: true }] },
        options: { plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } },
                      y: { grid, beginAtZero: true, ticks: { precision: 0 } } },
            maintainAspectRatio: false } });
}

/* panorama da Situação Fiscal — barras horizontais, por empresa ou por ente */
function _sfChart(mk, grid, moeda) {
    const el = document.getElementById('sf-chart');
    if (!el) return;
    const regs = M.filtra('situacao_fiscal');
    const modo = M._sfChartMode || 'empresa';
    let labels, dados;
    if (modo === 'ente') {
        const agg = {};
        regs.forEach(s => {
            const ente = { receita: 'Federal', dsot: 'Estadual', municipal: 'Municipal' }[s.origem] || 'Outro';
            agg[ente] = (agg[ente] || 0) + (+s.total_debitos || 0);
        });
        const itens = Object.entries(agg).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        labels = itens.map(([k]) => k); dados = itens.map(([, v]) => v);
    } else {
        const agg = {};
        regs.forEach(s => agg[s.empresa_id] = (agg[s.empresa_id] || 0) + (+s.total_debitos || 0));
        const top = Object.entries(agg).filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]).slice(0, 10);
        labels = top.map(([id]) => (empNome(id) || '?').slice(0, 24)); dados = top.map(([, v]) => v);
    }
    if (!dados.length) return;
    mk(el, {
        type: 'bar',
        data: { labels, datasets: [{ data: dados,
            backgroundColor: '#f87171cc', borderRadius: 8 }] },
        options: { indexAxis: 'y',
            plugins: { legend: { display: false },
                tooltip: { callbacks: { label: (c) => 'R$ ' + moeda(c.parsed.x) } } },
            scales: { x: { grid, ticks: { callback: moeda } },
                      y: { grid: { display: false } } },
            maintainAspectRatio: false } });
}

/* linha genérica de item de prazo */
function itemLinha(i, podeLembrete) {
    return `<div class="linha">
        <span class="ic" style="color:${i.cor}"><i class="fa-solid ${i.icone}"></i></span>
        <div class="linha-txt"><b>${esc(i.titulo)}</b><span>${esc(i.sub || '')}</span></div>
        ${i.pendente ? '<span class="pill atencao">pendência</span>' : ''}
        ${i.lembrete && podeLembrete
            ? `<button class="chk" onclick="M.acao(M.concluirLembrete,'${i.id}')"><i class="fa-solid fa-check"></i></button>`
            : pillData(i.dias, i.data)}
    </div>`;
}

/* ==================== BOOT ==================== */
(function boot() {
    $('#v-login').textContent = VERSAO;
    aplicarAparencia();

    /* cheque de versão no boot — o SW register/update fica no fim do boot */
    checarVersao();
    /* pill Conectado/Offline acompanha a rede em tempo real */
    window.addEventListener('online', () => { setStatus(true); if (M.sess) M.sincronizar(); });
    window.addEventListener('offline', () => setStatus(false));
    setStatus(navigator.onLine);
    /* pull-to-refresh: arrasta no topo da lista → sincroniza */
    const c = $('#conteudo'), ptrEl = $('#ptr'), ptrIco = ptrEl.querySelector('i');
    let y0 = null, puxa = 0, ptrBusy = false;
    const ptrFim = () => {
        ptrEl.classList.remove('gira');
        ptrEl.style.transform = 'translateY(-75px)';
        ptrEl.style.opacity = 0;
        ptrIco.style.transform = '';
    };
    c.addEventListener('touchstart', (e) => {
        if (c.scrollTop <= 0 && !ptrBusy) { y0 = e.touches[0].clientY; puxa = 0; }
    }, { passive: true });
    c.addEventListener('touchmove', (e) => {
        if (y0 == null) return;
        const d = e.touches[0].clientY - y0;
        if (d <= 0 || c.scrollTop > 0) { y0 = null; ptrFim(); return; }
        e.preventDefault();
        puxa = Math.min(d * .55, 90);            // resistência elástica
        ptrEl.style.transition = 'none';
        ptrEl.style.transform = `translateY(${puxa - 75}px)`;
        ptrEl.style.opacity = Math.min(puxa / 55, 1);
        ptrIco.style.transform = `rotate(${puxa * 4}deg)`;
    }, { passive: false });
    c.addEventListener('touchend', () => {
        if (y0 == null) return;
        y0 = null;
        ptrEl.style.transition = '';
        if (puxa >= 60) {
            ptrBusy = true;
            ptrEl.classList.add('gira');
            ptrEl.style.transform = 'translateY(0)';
            ptrEl.style.opacity = 1;
            Promise.resolve(M.sincronizar(true)).finally(() => { ptrBusy = false; ptrFim(); });
        } else ptrFim();
    });

    // máscara de CPF no login: só formata quando a entrada é só dígitos
    $('#l-usuario').addEventListener('input', (ev) => {
        const v = ev.target.value;
        if (!/^\d[\d.\-]*$/.test(v)) return;        // tem letra → usuário/e-mail
        const d = v.replace(/\D/g, '').slice(0, 11);
        ev.target.value = d
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    });

    $('#form-login').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const btn = $('#btn-entrar'), erro = $('#login-erro');
        erro.classList.add('hidden');
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Entrando…';
        try {
            await M.login($('#l-usuario').value, $('#l-senha').value);
            await entrarNoApp();
        } catch (e) {
            erro.textContent = e.message || 'Falha no login.';
            erro.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Entrar';
        }
    });

    async function entrarNoApp() {
        $('#tela-login').classList.add('hidden');
        $('#app').classList.remove('hidden');
        await M.sincronizar(true);
    }

    // sessão persistida — com digital ativada, exige biometria antes de abrir
    try { M.sess = JSON.parse(localStorage.getItem(K_SESS)); } catch { M.sess = null; }
    if (M.sess?.access_token) {
        if (localStorage.getItem(K_BIO) && window.PublicKeyCredential) {
            $('#bio-lock').classList.remove('hidden');
            setTimeout(() => M.bioEntrar(), 400);
        } else entrarNoApp();
    }

    // service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js?v=' + VERSAO).then(reg => {
            reg.update();
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName))
                    toast('Nova versão instalada — será aplicada no próximo acesso.');
                else location.reload();
            });
        }).catch(() => {});
    }
})();
