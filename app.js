/* =========================================================
 * SG Office Mobile — PWA de consulta e ações rápidas
 * Fala direto com o Supabase (chave publishable + RLS):
 *   login  → /auth/v1/token (grant_type=password)
 *   dados  → /rest/v1/dados?chave=like.sgo_*  (espelho do app desktop)
 *   escopo → u.empresas do usuário (igual Auth.escopoEmpresas do desktop)
 * ========================================================= */
'use strict';

const VERSAO = '1.0';
const SUPA = (window.SGO_CFG?.SUPABASE_URL || '').replace(/\/$/, '');
const AKEY = window.SGO_CFG?.SUPABASE_KEY || '';
const K_SESS = 'sgo_mob_sess';      // {access_token, refresh_token, usuario, user_id}
const K_TEMA = 'sgo_mob_tema';
const K_FUNDO = 'sgo_mob_fundo';

/* tema (sacro|claro) + fundo (aura|estrelas|liso) — fixos por dispositivo */
function aplicarAparencia() {
    const tema = localStorage.getItem(K_TEMA) || 'sacro';
    const fundo = localStorage.getItem(K_FUNDO) || 'aura';
    document.body.classList.toggle('claro', tema === 'claro');
    document.body.dataset.fundo = fundo;
    document.querySelectorAll('#seg-tema button').forEach(b =>
        b.classList.toggle('on', b.dataset.t === tema));
    document.querySelectorAll('#seg-fundo button').forEach(b =>
        b.classList.toggle('on', b.dataset.f === fundo));
}
function setTema(t) { localStorage.setItem(K_TEMA, t); aplicarAparencia(); }
function setFundo(f) { localStorage.setItem(K_FUNDO, f); aplicarAparencia(); }
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
const setStatus = (on) => { $('#dot-status').className = 'dot-status ' + (on ? 'on' : 'off'); };
const splashSync = (v) => $('#splash-sync').classList.toggle('hidden', !v);

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
        try {
            const r = await fetch(`${SUPA}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: { apikey: AKEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: M.sess.refresh_token })
            });
            const j = await r.json();
            if (!r.ok) throw 0;
            M.sess.access_token = j.access_token;
            M.sess.refresh_token = j.refresh_token || M.sess.refresh_token;
            localStorage.setItem(K_SESS, JSON.stringify(M.sess));
            return true;
        } catch { M.sair(true); return false; }
    },

    sair(silencioso) {
        localStorage.removeItem(K_SESS);
        M.sess = null; M.usuario = null; M.dados = {};
        $('#app').classList.add('hidden');
        $('#tela-login').classList.remove('hidden');
        if (!silencioso) toast('Sessão encerrada.');
    },

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
            return localStorage.getItem(K_ESCOPO) === 'carteira' ? new Set(u.empresas || []) : null;
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
        const titulos = { inicio: 'Início', empresas: 'Empresas', prazos: 'Prazos',
                          tarefas: 'Tarefas', perfil: 'Perfil' };
        $('#topo-titulo').textContent = titulos[nome] || 'SG Office';
        M.render();
        $('#conteudo').scrollTop = 0;
    },

    render() {
        M.badges();
        const map = { inicio: R.inicio, empresas: R.empresas, prazos: R.prazos,
                      tarefas: R.tarefas, perfil: R.perfil };
        $('#conteudo').innerHTML = M._emp ? R.empresaDetalhe(M._emp) : (map[M._aba] || R.inicio)();
    },

    badges() {
        const nP = itensPrazo().filter(i => (i.dias ?? 99) <= 15).length;
        const nT = M.filtra('tarefas').filter(t => (t.coluna || 'afazer') !== 'concluido').length;
        $('#badge-prazos').textContent = nP; $('#badge-prazos').classList.toggle('hidden', !nP);
        $('#badge-tarefas').textContent = nT; $('#badge-tarefas').classList.toggle('hidden', !nT);
    },

    voltarEmpresa() { M._emp = null; M.render(); },
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
    toggleTema() {
        setTema(document.body.classList.contains('claro') ? 'sacro' : 'claro');
        M.render();
    },
};

/* ---------- helpers de domínio ---------- */
const regimeVigente = (e, data) => {
    const h = data || hojeISO();
    const v = (e?.regimes || []).find(r => (!r.inicio || r.inicio <= h) && (!r.fim || r.fim >= h));
    return v?.regime || e?.regime || '—';
};
const empNome = (id) => M.empresa(id)?.nome || '';
const ativa = (e) => e.ativa !== false && String(e.ativa) !== 'false';

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
    inicio() {
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
        const esc = M.escopo();

        return `
        <div class="saudacao">
            <h2>${saud}, ${esc(u.nome?.split(' ')[0] || 'usuário')}!</h2>
            <p>${esc ? `sua carteira · ${emps.length} empresa(s)` : `${emps.length} empresa(s) ativas`}</p>
        </div>
        <div class="grid-cards">
            <div class="mini-card" onclick="M.aba('empresas')">
                <i class="fa-solid fa-building" style="color:#38bdf8"></i>
                <b>${emps.length}</b><span>Empresas</span></div>
            <div class="mini-card" onclick="M.aba('prazos')">
                <i class="fa-solid fa-file-shield" style="color:#ef4444"></i>
                <b>${certsV + certs15}</b><span>Certidões ≤15d</span></div>
            <div class="mini-card" onclick="M.aba('prazos')">
                <i class="fa-solid fa-certificate" style="color:#a78bfa"></i>
                <b>${certifs15}</b><span>Certificados ≤15d</span></div>
            <div class="mini-card" onclick="M.aba('tarefas')">
                <i class="fa-solid fa-list-check" style="color:#f59e0b"></i>
                <b>${tar}</b><span>Tarefas abertas</span></div>
        </div>
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
            : lista.map(e => {
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
                </button>`;}).join('')}`;
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

        return `
        <button class="voltar" onclick="M.voltarEmpresa()"><i class="fa-solid fa-arrow-left"></i> Empresas</button>
        <div class="card emp-cab">
            <h2>${esc(e.nome)}</h2>
            <p>${esc(e.cnpj || 'sem CNPJ')}${e.municipio ? ' · ' + esc(e.municipio) + '/' + esc(e.uf || '') : ''}</p>
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
            <div class="card-head"><h3><i class="fa-solid fa-file-shield"></i> Certidões</h3></div>
            ${certs.length === 0 ? '<div class="vazio">Nenhuma registrada.</div>'
                : certs.map(c => `<div class="linha">
                    <i class="fa-solid fa-file-shield" style="color:#38bdf8"></i>
                    <div class="linha-txt"><b>${esc(c.tipo)}</b><span>${c.pendente ? 'com pendências' : (c.numero ? 'nº ' + esc(c.numero) : '')}${c.via_matriz ? ' · via matriz' : ''}</span></div>
                    ${pillData(diasPara(c.vencimento), c.vencimento)}</div>`).join('')}
        </div>
        <div class="card">
            <div class="card-head"><h3><i class="fa-solid fa-certificate"></i> Certificados digitais</h3></div>
            ${certifs.length === 0 ? '<div class="vazio">Nenhum registrado.</div>'
                : certifs.map(c => `<div class="linha">
                    <i class="fa-solid fa-certificate" style="color:#a78bfa"></i>
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
            ${hist.map(r => `<div class="linha"><i class="fa-solid fa-bookmark" style="color:#f59e0b"></i>
                <div class="linha-txt"><b>${esc(r.regime)}</b><span>${fmtData(r.inicio)} → ${r.fim ? fmtData(r.fim) : 'atual'}</span></div></div>`).join('')}
        </div>` : ''}`;
    },

    prazos() {
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
            : lista.map(i => itemLinha(i, pode)).join('')}`;
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
            : lista.map(t => {
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
                </div>`;}).join('')}`;
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
        ${u.papel === 'admin' && Array.isArray(u.empresas) ? `
        <button class="opcao" onclick="M.toggleEscopo()">
            <i class="fa-solid fa-briefcase" style="color:#f59e0b"></i>
            <div class="linha-txt"><b>Ver só minha carteira</b>
            <span>${escopoCart ? `sim — ${nEmp} empresa(s)` : 'não — todas as empresas'}</span></div>
            <span class="switch ${escopoCart ? 'on' : ''}"></span></button>` : ''}
        <button class="opcao" onclick="M.toggleTema()">
            <i class="fa-solid fa-moon" style="color:#a78bfa"></i>
            <div class="linha-txt"><b>Tema claro</b><span>alternar claro/escuro</span></div>
            <span class="switch ${document.body.classList.contains('claro') ? 'on' : ''}"></span></button>
        <button class="opcao" onclick="M.sincronizar(true)">
            <i class="fa-solid fa-rotate" style="color:#38bdf8"></i>
            <div class="linha-txt"><b>Sincronizar agora</b><span>buscar dados mais recentes</span></div>
            <i class="fa-solid fa-chevron-right seta"></i></button>
        <button class="opcao" onclick="M.sair()">
            <i class="fa-solid fa-right-from-bracket" style="color:#ef4444"></i>
            <div class="linha-txt"><b>Sair da conta</b><span>encerrar sessão neste aparelho</span></div>
            <i class="fa-solid fa-chevron-right seta"></i></button>
        <p class="versao-rodape" onclick="navigator.clipboard?.writeText('SGO Mobile v${VERSAO}');toast('Versão copiada.')">
            SG Office Mobile · v${VERSAO}</p>`;
    },
};

/* linha genérica de item de prazo */
function itemLinha(i, podeLembrete) {
    return `<div class="linha">
        <i class="fa-solid ${i.icone}" style="color:${i.cor}"></i>
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

    /* atualização automática: força check do SW e recarrega quando a
       versão nova assumir (senão a aba aberta fica presa na versão velha) */
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(r => r && r.update());
        let recarregou = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (recarregou) return;
            recarregou = true;
            location.reload();
        });
    }
    document.querySelectorAll('#seg-tema button').forEach(b =>
        b.onclick = () => setTema(b.dataset.t));
    document.querySelectorAll('#seg-fundo button').forEach(b =>
        b.onclick = () => setFundo(b.dataset.f));

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

    // sessão persistida
    try { M.sess = JSON.parse(localStorage.getItem(K_SESS)); } catch { M.sess = null; }
    if (M.sess?.access_token) entrarNoApp();

    // service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
            reg.update();
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName))
                    toast('Nova versão instalada — será aplicada no próximo acesso.');
                else location.reload();
            });
        }).catch(() => {});
    }
})();
