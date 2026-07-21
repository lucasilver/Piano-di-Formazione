// Inizializzazione client Supabase
const SUPABASE_URL = 'https://zbokkaxvwirinflrquat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_a-Tv3HwY_h27g3UI6U125A_chZ_g2wx';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let appState = {
    user: null,
    userRole: 'lettore',
    edizioni: [],
    edizioneCorrenteId: null,
    edizioneCorrenteAnno: null,
    edizioneStato: 'bozza',
    corsi: [],
    filtri: { ricerca: '', area: '', stato: '' },
    sortCampo: 'argomento',
    sortAscending: true
};

const DOM = {
    loginContainer: document.getElementById('login-container'),
    appContainer: document.getElementById('app-container'),
    loginForm: document.getElementById('login-form'),
    logoutBtn: document.getElementById('logout-btn'),
    userDisplay: document.getElementById('user-display'),
    selectAnno: document.getElementById('select-anno'),
    btnClonaAnno: document.getElementById('btn-clona-anno'),
    btnApprovaPiano: document.getElementById('btn-approva-piano'),
    approvazioneBox: document.getElementById('approvazione-box'),
    kpiDataApprovazione: document.getElementById('kpi-data-approvazione'),
    tableHeaderRow: document.getElementById('table-header-row'),
    corsiTbody: document.getElementById('corsi-tbody'),
    corsiTfoot: document.getElementById('corsi-tfoot'),
    btnApriForm: document.getElementById('btn-apri-form'),
    corsoModal: document.getElementById('corso-modal'),
    corsoForm: document.getElementById('corso-form'),
    btnChiudiModal: document.getElementById('btn-chiudi-modal'),
    modalTitle: document.getElementById('modal-title'),
    sezioneV2: document.getElementById('sezione-v2'),
    searchInput: document.getElementById('search-input'),
    filterArea: document.getElementById('filter-area'),
    filterStato: document.getElementById('filter-stato'),
    btnExportExcel: document.getElementById('btn-export-excel'),
    btnExportPDF: document.getElementById('btn-export-pdf')
};

// --- UTILITY PER ORE HH:MM <-> MINUTI ---
function minutiToHHMM(minuti) {
    if (!minuti || isNaN(minuti)) return '00:00';
    const h = Math.floor(minuti / 60).toString().padStart(2, '0');
    const m = (minuti % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

function hhmmToMinuti(str) {
    if (!str || !str.includes(':')) return 0;
    const [h, m] = str.split(':').map(Number);
    return ((h || 0) * 60) + (m || 0);
}

// --- INIT & AUTH ---
document.addEventListener('DOMContentLoaded', () => {
    initAuthListener();
    setupEventListeners();
    setupAutoCalculations();
    setupSortingAndRowExpansion();
});

function initAuthListener() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            appState.user = session.user;
            appState.userRole = session.user.user_metadata?.role || 'lettore';
            DOM.loginContainer.classList.add('hidden');
            DOM.appContainer.classList.remove('hidden');
            DOM.userDisplay.textContent = `${session.user.email} (${appState.userRole})`;
            
            caricaEdizioni();
        } else {
            appState.user = null;
            DOM.loginContainer.classList.remove('hidden');
            DOM.appContainer.classList.add('hidden');
        }
    });
}

DOM.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert("Accesso negato: " + error.message);
});

DOM.logoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = window.location.origin + window.location.pathname;
});

// --- CARICAMENTO EDITIONS & PIANO ---
async function caricaEdizioni() {
    const { data, error } = await supabaseClient.from('edizioni_piano').select('*').order('anno', { ascending: false });
    if (error) return console.error(error);
    
    appState.edizioni = data;
    if (data.length === 0) {
        const annoCorrente = new Date().getFullYear();
        const { data: nuovaEd } = await supabaseClient.from('edizioni_piano').insert([{ anno: annoCorrente, stato: 'bozza' }]).select();
        appState.edizioni = nuovaEd;
    }

    DOM.selectAnno.innerHTML = appState.edizioni.map(e => `<option value="${e.id}">${e.anno} (${e.stato})</option>`).join('');
    setEdizioneCorrente(DOM.selectAnno.value);
}

function setEdizioneCorrente(id) {
    appState.edizioneCorrenteId = id;
    const ed = appState.edizioni.find(e => e.id === id);
    if (!ed) return;

    appState.edizioneCorrenteAnno = ed.anno;
    appState.edizioneStato = ed.stato;

    // Gestione visualizzazione stato Approvato
    if (ed.stato === 'approvato') {
        DOM.approvazioneBox.classList.remove('hidden');
        DOM.kpiDataApprovazione.textContent = ed.data_approvazione ? new Date(ed.data_approvazione).toLocaleDateString('it-IT') : 'Sì';
        DOM.btnApprovaPiano.classList.add('hidden');
        DOM.sezioneV2.classList.remove('hidden');
        DOM.corsiTfoot.classList.remove('hidden');
    } else {
        DOM.approvazioneBox.classList.add('hidden');
        DOM.sezioneV2.classList.add('hidden');
        DOM.corsiTfoot.classList.add('hidden');
        
        if (appState.userRole === 'responsabile' || appState.userRole === 'admin') {
            DOM.btnApprovaPiano.classList.remove('hidden');
        } else {
            DOM.btnApprovaPiano.classList.add('hidden');
        }
    }

    renderTableHeader();
    caricaCorsi();
}

// --- APPROVAZIONE PIANO ---
DOM.btnApprovaPiano.addEventListener('click', async () => {
    if (appState.userRole !== 'responsabile' && appState.userRole !== 'admin') {
        return alert("Solo il Responsabile Formazione può approvare il piano.");
    }
    if (!confirm(`Sei sicuro di voler APPROVARE il Piano della Formazione ${appState.edizioneCorrenteAnno}? Verranno abilitati i campi consuntivi.`)) return;

    const timestamp = new Date().toISOString();
    const { error } = await supabaseClient
        .from('edizioni_piano')
        .update({ stato: 'approvato', data_approvazione: timestamp })
        .eq('id', appState.edizioneCorrenteId);

    if (error) alert("Errore durante l'approvazione: " + error.message);
    else caricaEdizioni();
});

// --- CLONA PIANO AD ANNO SUCCESSIVO ---
DOM.btnClonaAnno.addEventListener('click', async () => {
    if (appState.userRole !== 'responsabile' && appState.userRole !== 'admin') {
        return alert("Solo il Responsabile Formazione o l'Admin possono passare all'anno successivo.");
    }

    const nuovoAnno = Number(appState.edizioneCorrenteAnno) + 1;
    
    // Verifica se l'edizione esiste già
    const giaEsistente = appState.edizioni.find(e => Number(e.anno) === nuovoAnno);
    if (giaEsistente) {
        return alert(`L'edizione del piano per l'anno ${nuovoAnno} esiste già.`);
    }

    if (!confirm(`Vuoi creare la nuova edizione per l'anno ${nuovoAnno} clonando i corsi attuali (solo dati V1 base)?`)) return;

    // 1. Inserisce la nuova edizione in stato bozza
    const { data: nuovaEd, error: errEd } = await supabaseClient
        .from('edizioni_piano')
        .insert([{ anno: nuovoAnno, stato: 'bozza' }])
        .select();

    if (errEd) return alert("Errore creazione nuova edizione: " + errEd.message);

    const nuovaEdId = nuovaEd[0].id;

    // 2. Clona i corsi attuali mantenendo solo i campi V1
    const nuoviCorsi = appState.corsi.map(c => ({
        edizione_id: nuovaEdId,
        lepta: c.lepta,
        area: c.area,
        segmento_formativo: c.segmento_formativo,
        argomento: c.argomento,
        valenza: c.valenza,
        tipologia: c.tipologia,
        obiettivi: '',
        destinatari: '',
        stato_avanzamento: 'Pianificato',
        creato_da: appState.user.id
    }));

    if (nuoviCorsi.length > 0) {
        const { error: errCorsi } = await supabaseClient.from('corsi').insert(nuoviCorsi);
        if (errCorsi) alert("Errore durante la clonazione dei corsi: " + errCorsi.message);
    }

    alert(`Edizione ${nuovoAnno} creata con successo!`);
    await caricaEdizioni();
});

// --- RENDER INTESTAZIONE TABELLA DINAMICA ---
function renderTableHeader() {
    let html = `
        <th data-sort="lepta">LEPTA</th>
        <th data-sort="area">Area</th>
        <th data-sort="segmento_formativo">Segmento</th>
        <th data-sort="argomento">Argomento</th>
        <th data-sort="valenza">Valenza</th>
        <th data-sort="tipologia">Tipologia</th>
        <th data-sort="stato_avanzamento">Stato</th>
    `;

    if (appState.edizioneStato === 'approvato') {
        html += `
            <th data-sort="edizioni">Ediz.</th>
            <th data-sort="partecipanti">Part. Tot.</th>
            <th data-sort="dirigenti">Dirig.</th>
            <th data-sort="comparto">Comp.</th>
            <th data-sort="uomini_comparto">U. Comp.</th>
            <th data-sort="donne_comparto">D. Comp.</th>
            <th data-sort="uomini_dirigenti">U. Dir.</th>
            <th data-sort="donne_dirigenti">D. Dir.</th>
            <th data-sort="ore_minuti">Ore</th>
            <th data-sort="totale_spesa">Spesa Tot.</th>
        `;
    }

    html += `<th class="actions-col">Azioni</th>`;
    DOM.tableHeaderRow.innerHTML = html;
}

// --- CARICAMENTO E DISPLAY CORSI ---
async function caricaCorsi() {
    const { data, error } = await supabaseClient.from('corsi').select('*').eq('edizione_id', appState.edizioneCorrenteId);
    if (error) return alert("Errore caricamento corsi: " + error.message);
    appState.corsi = data;
    processaEDisplay();
}

function processaEDisplay() {
    let corsiFiltrati = [...appState.corsi];

    if (appState.filtri.ricerca) {
        const q = appState.filtri.ricerca.toLowerCase();
        corsiFiltrati = corsiFiltrati.filter(c => 
            c.argomento.toLowerCase().includes(q) || 
            (c.titolo && c.titolo.toLowerCase().includes(q)) ||
            (c.codice && c.codice.toLowerCase().includes(q))
        );
    }
    if (appState.filtri.area) corsiFiltrati = corsiFiltrati.filter(c => c.area === appState.filtri.area);
    if (appState.filtri.stato) corsiFiltrati = corsiFiltrati.filter(c => c.stato_avanzamento === appState.filtri.stato);

    renderTabella(corsiFiltrati);
    calcolaKPI();
    if (appState.edizioneStato === 'approvato') calcolaTotaliPieDiPagina(corsiFiltrati);
}

function renderTabella(lista) {
    if (lista.length === 0) {
        const colSpan = appState.edizioneStato === 'approvato' ? 18 : 8;
        DOM.corsiTbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;">Nessun corso presente.</td></tr>`;
        return;
    }

    const isApprovato = appState.edizioneStato === 'approvato';

    DOM.corsiTbody.innerHTML = lista.map(c => `
        <tr data-id="${c.id}">
            <td><strong>${c.lepta}</strong></td>
            <td>${c.area}</td>
            <td><small>${c.segmento_formativo}</small></td>
            <td><strong>${c.argomento}</strong> ${c.titolo ? `<br><small>${c.titolo}</small>` : ''}</td>
            <td>${c.valenza}</td>
            <td>${c.tipologia}</td>
            <td><span class="badge badge-${c.stato_avanzamento.toLowerCase().replace(' ', '')}">${c.stato_avanzamento}</span></td>
            ${isApprovato ? `
                <td>${c.edizioni || 0}</td>
                <td><strong>${c.partecipanti || 0}</strong></td>
                <td>${c.dirigenti || 0}</td>
                <td>${c.comparto || 0}</td>
                <td>${c.uomini_comparto || 0}</td>
                <td>${c.donne_comparto || 0}</td>
                <td>${c.uomini_dirigenti || 0}</td>
                <td>${c.donne_dirigenti || 0}</td>
                <td>${minutiToHHMM(c.ore_minuti)}</td>
                <td>€ ${(c.totale_spesa || 0).toFixed(2)}</td>
            ` : ''}
            <td class="actions-col" onclick="event.stopPropagation()">
                <button class="btn btn-secondary btn-sm" onclick="clonaCorso('${c.id}')" title="Clona base corso">Clona</button>
                ${(appState.userRole === 'admin' || appState.userRole === 'responsabile') ? `
                    <button class="btn btn-secondary btn-sm" onclick="apriModificaCorso('${c.id}')">Modifica</button>
                    <button class="btn btn-danger btn-sm" onclick="eliminaCorso('${c.id}')">Elimina</button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

// --- LOGICA DI ORDINAMENTO TABELLA ---
function setupSortingAndRowExpansion() {
    // Click sulle intestazioni per ordinare
    DOM.tableHeaderRow.addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th || !th.dataset.sort) return;

        const campo = th.dataset.sort;
        if (appState.sortCampo === campo) {
            appState.sortAscending = !appState.sortAscending;
        } else {
            appState.sortCampo = campo;
            appState.sortAscending = true;
        }

        appState.corsi.sort((a, b) => {
            let valA = a[campo] ?? '';
            let valB = b[campo] ?? '';
            
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return appState.sortAscending ? -1 : 1;
            if (valA > valB) return appState.sortAscending ? 1 : -1;
            return 0;
        });

        processaEDisplay();
    });

    // Click sulla riga per espandere/comprimere il testo
    DOM.corsiTbody.addEventListener('click', (e) => {
        const tr = e.target.closest('tr');
        if (tr && !e.target.closest('.actions-col')) {
            tr.classList.toggle('expanded');
        }
    });
}

// --- CALCOLO TOTALI FOOTER ---
function calcolaTotaliPieDiPagina(lista) {
    const tot = lista.reduce((acc, c) => {
        acc.edizioni += Number(c.edizioni || 0);
        acc.partecipanti += Number(c.partecipanti || 0);
        acc.dirigenti += Number(c.dirigenti || 0);
        acc.comparto += Number(c.comparto || 0);
        acc.uomini_comparto += Number(c.uomini_comparto || 0);
        acc.donne_comparto += Number(c.donne_comparto || 0);
        acc.uomini_dirigenti += Number(c.uomini_dirigenti || 0);
        acc.donne_dirigenti += Number(c.donne_dirigenti || 0);
        acc.ore_minuti += Number(c.ore_minuti || 0);
        acc.totale_spesa += Number(c.totale_spesa || 0);
        return acc;
    }, { edizioni:0, partecipanti:0, dirigenti:0, comparto:0, uomini_comparto:0, donne_comparto:0, uomini_dirigenti:0, donne_dirigenti:0, ore_minuti:0, totale_spesa:0 });

    document.getElementById('tot-edizioni').textContent = tot.edizioni;
    document.getElementById('tot-partecipanti').textContent = tot.partecipanti;
    document.getElementById('tot-dirigenti').textContent = tot.dirigenti;
    document.getElementById('tot-comparto').textContent = tot.comparto;
    document.getElementById('tot-uomini-comp').textContent = tot.uomini_comparto;
    document.getElementById('tot-donne-comp').textContent = tot.donne_comparto;
    document.getElementById('tot-uomini-dir').textContent = tot.uomini_dirigenti;
    document.getElementById('tot-donne-dir').textContent = tot.donne_dirigenti;
    
    // Inseriamo o aggiorniamo la cella ore nel tfoot dinamicamente
    let totOreElem = document.getElementById('tot-ore');
    if (!totOreElem) {
        totOreElem = document.createElement('td');
        totOreElem.id = 'tot-ore';
        const spesaTd = document.getElementById('tot-spesa');
        spesaTd.parentNode.insertBefore(totOreElem, spesaTd);
    }
    totOreElem.textContent = minutiToHHMM(tot.ore_minuti);
    document.getElementById('tot-spesa').textContent = `€ ${tot.totale_spesa.toFixed(2)}`;
}

// --- CALCOLI AUTOMATICI E VALIDAZIONE MODALE ---
function setupAutoCalculations() {
    const compInput = document.getElementById('form-comparto');
    const dirInput = document.getElementById('form-dirigenti');
    const partInput = document.getElementById('form-partecipanti');

    function ricalcolaPartecipanti() {
        const comp = parseInt(compInput.value) || 0;
        const dir = parseInt(dirInput.value) || 0;
        partInput.value = comp + dir;
    }

    compInput.addEventListener('input', ricalcolaPartecipanti);
    dirInput.addEventListener('input', ricalcolaPartecipanti);
}

// --- SALVATAGGIO CON VALIDAZIONE ---
DOM.corsoForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validazioni consuntive se il piano è approvato
    if (appState.edizioneStato === 'approvato') {
        const comp = parseInt(document.getElementById('form-comparto').value) || 0;
        const uComp = parseInt(document.getElementById('form-uomini-comparto').value) || 0;
        const dComp = parseInt(document.getElementById('form-donne-comparto').value) || 0;
        if (uComp + dComp !== comp) {
            return alert(`Errore di quadratura: La somma di Uomini Comparto (${uComp}) e Donne Comparto (${dComp}) deve essere uguale al totale Comparto (${comp}).`);
        }

        const dir = parseInt(document.getElementById('form-dirigenti').value) || 0;
        const uDir = parseInt(document.getElementById('form-uomini-dirigenti').value) || 0;
        const dDir = parseInt(document.getElementById('form-donne-dirigenti').value) || 0;
        if (uDir + dDir !== dir) {
            return alert(`Errore di quadratura: La somma di Uomini Dirigenti (${uDir}) e Donne Dirigenti (${dDir}) deve essere uguale al totale Dirigenti (${dir}).`);
        }

        const compPerc = parseFloat(document.getElementById('form-comparto-spesa-perc').value) || 0;
        const dirPerc = parseFloat(document.getElementById('form-dirigenti-spesa-perc').value) || 0;
        if ((compPerc + dirPerc > 0) && Math.round(compPerc + dirPerc) !== 100) {
            return alert(`Errore di quadratura: La somma delle percentuali di spesa Comparto (${compPerc}%) e Dirigenti (${dirPerc}%) deve fare esattamente 100%.`);
        }
    }

    const id = document.getElementById('corso-id').value;
    const corsoData = {
        edizione_id: appState.edizioneCorrenteId,
        lepta: document.getElementById('form-lepta').value,
        area: document.getElementById('form-area').value,
        segmento_formativo: document.getElementById('form-segmento').value,
        argomento: document.getElementById('form-argomento').value,
        valenza: document.getElementById('form-valenza').value,
        tipologia: document.getElementById('form-tipologia').value,
        stato_avanzamento: document.getElementById('form-stato').value,
        obiettivi: document.getElementById('form-obiettivi').value,
        destinatari: document.getElementById('form-destinatari').value,
        
        // Campi V2
        codice: document.getElementById('form-codice').value,
        titolo: document.getElementById('form-titolo').value,
        edizioni: parseInt(document.getElementById('form-edizioni').value) || 0,
        partecipanti: parseInt(document.getElementById('form-partecipanti').value) || 0,
        dirigenti: parseInt(document.getElementById('form-dirigenti').value) || 0,
        comparto: parseInt(document.getElementById('form-comparto').value) || 0,
        uomini_comparto: parseInt(document.getElementById('form-uomini-comparto').value) || 0,
        donne_comparto: parseInt(document.getElementById('form-donne-comparto').value) || 0,
        uomini_dirigenti: parseInt(document.getElementById('form-uomini-dirigenti').value) || 0,
        donne_dirigenti: parseInt(document.getElementById('form-donne-dirigenti').value) || 0,
        ore_minuti: hhmmToMinuti(document.getElementById('form-ore').value),
        totale_spesa: parseFloat(document.getElementById('form-totale-spesa').value) || 0,
        comparto_spesa_perc: parseFloat(document.getElementById('form-comparto-spesa-perc').value) || 0,
        dirigenti_spesa_perc: parseFloat(document.getElementById('form-dirigenti-spesa-perc').value) || 0,
        valutazione_ecm: parseFloat(document.getElementById('form-ecm').value) || 0,
        
        updated_at: new Date().toISOString()
    };

    if (id) {
        const { error } = await supabaseClient.from('corsi').update(corsoData).eq('id', id);
        if (error) alert(error.message);
    } else {
        corsoData.creato_da = appState.user.id;
        const { error } = await supabaseClient.from('corsi').insert([corsoData]);
        if (error) alert(error.message);
    }

    DOM.corsoModal.classList.add('hidden');
    caricaCorsi();
});

// --- AZIONE CLONA CORSO ---
window.clonaCorso = function(id) {
    const c = appState.corsi.find(item => item.id === id);
    if (!c) return;

    DOM.corsoForm.reset();
    document.getElementById('corso-id').value = ''; // Nuovo record

    // Mantiene V1
    document.getElementById('form-lepta').value = c.lepta;
    document.getElementById('form-area').value = c.area;
    document.getElementById('form-segmento').value = c.segmento_formativo;
    document.getElementById('form-argomento').value = c.argomento;
    document.getElementById('form-valenza').value = c.valenza;
    document.getElementById('form-tipologia').value = c.tipologia;
    document.getElementById('form-stato').value = 'Pianificato';
    document.getElementById('form-obiettivi').value = c.obiettivi || '';
    document.getElementById('form-destinatari').value = c.destinatari || '';

    // Svuota V2 esplicitamente
    document.getElementById('form-codice').value = '';
    document.getElementById('form-titolo').value = '';
    document.getElementById('form-edizioni').value = 0;
    document.getElementById('form-partecipanti').value = 0;
    document.getElementById('form-dirigenti').value = 0;
    document.getElementById('form-comparto').value = 0;
    document.getElementById('form-uomini-comparto').value = 0;
    document.getElementById('form-donne-comparto').value = 0;
    document.getElementById('form-uomini-dirigenti').value = 0;
    document.getElementById('form-donne-dirigenti').value = 0;
    document.getElementById('form-ore').value = '00:00';
    document.getElementById('form-totale-spesa').value = 0.00;
    document.getElementById('form-comparto-spesa-perc').value = 0;
    document.getElementById('form-dirigenti-spesa-perc').value = 0;
    document.getElementById('form-ecm').value = 0.0;

    DOM.modalTitle.textContent = "Clona Corso (Nuova Bozza)";
    DOM.corsoModal.classList.remove('hidden');
};

window.apriModificaCorso = function(id) {
    const c = appState.corsi.find(item => item.id === id);
    if (!c) return;
    
    document.getElementById('corso-id').value = c.id;
    document.getElementById('form-lepta').value = c.lepta;
    document.getElementById('form-area').value = c.area;
    document.getElementById('form-segmento').value = c.segmento_formativo;
    document.getElementById('form-argomento').value = c.argomento;
    document.getElementById('form-valenza').value = c.valenza;
    document.getElementById('form-tipologia').value = c.tipologia;
    document.getElementById('form-stato').value = c.stato_avanzamento;
    document.getElementById('form-obiettivi').value = c.obiettivi;
    document.getElementById('form-destinatari').value = c.destinatari;

    // Popola campi V2
    document.getElementById('form-codice').value = c.codice || '';
    document.getElementById('form-titolo').value = c.titolo || '';
    document.getElementById('form-edizioni').value = c.edizioni || 0;
    document.getElementById('form-partecipanti').value = c.partecipanti || 0;
    document.getElementById('form-dirigenti').value = c.dirigenti || 0;
    document.getElementById('form-comparto').value = c.comparto || 0;
    document.getElementById('form-uomini-comparto').value = c.uomini_comparto || 0;
    document.getElementById('form-donne-comparto').value = c.donne_comparto || 0;
    document.getElementById('form-uomini-dirigenti').value = c.uomini_dirigenti || 0;
    document.getElementById('form-donne-dirigenti').value = c.donne_dirigenti || 0;
    document.getElementById('form-ore').value = minutiToHHMM(c.ore_minuti);
    document.getElementById('form-totale-spesa').value = c.totale_spesa || 0;
    document.getElementById('form-comparto-spesa-perc').value = c.comparto_spesa_perc || 0;
    document.getElementById('form-dirigenti-spesa-perc').value = c.dirigenti_spesa_perc || 0;
    document.getElementById('form-ecm').value = c.valutazione_ecm || 0;

    DOM.modalTitle.textContent = "Modifica Corso di Formazione";
    DOM.corsoModal.classList.remove('hidden');
};

window.eliminaCorso = async function(id) {
    if (!confirm("Sei sicuro di voler eliminare questo corso?")) return;
    const { error } = await supabaseClient.from('corsi').delete().eq('id', id);
    if (error) alert(error.message);
    caricaCorsi();
};

function calcolaKPI() {
    const totale = appState.corsi.length;
    if (totale === 0) {
        ['pianificato', 'corso', 'concluso', 'annullato'].forEach(s => document.getElementById(`kpi-${s}`).textContent = '0%');
        return;
    }
    const conteggi = { 'Pianificato': 0, 'In corso': 0, 'Concluso': 0, 'Annullato': 0 };
    appState.corsi.forEach(c => conteggi[c.stato_avanzamento] = (conteggi[c.stato_avanzamento] || 0) + 1);
    
    document.getElementById('kpi-pianificato').textContent = Math.round((conteggi['Pianificato'] / totale) * 100) + '%';
    document.getElementById('kpi-corso').textContent = Math.round((conteggi['In corso'] / totale) * 100) + '%';
    document.getElementById('kpi-concluso').textContent = Math.round((conteggi['Concluso'] / totale) * 100) + '%';
    document.getElementById('kpi-annullato').textContent = Math.round((conteggi['Annullato'] / totale) * 100) + '%';
}

// --- ESPORTAZIONE EXCEL ---
DOM.btnExportExcel.addEventListener('click', () => {
    if (appState.corsi.length === 0) return alert("Nessun dato da esportare.");

    const isApprovato = appState.edizioneStato === 'approvato';
    const datiExport = appState.corsi.map(c => {
        let riga = {
            'LEPTA': c.lepta,
            'Area': c.area,
            'Segmento Formativo': c.segmento_formativo,
            'Argomento': c.argomento,
            'Valenza': c.valenza,
            'Tipologia': c.tipologia,
            'Stato Avanzamento': c.stato_avanzamento,
            'Obiettivi': c.obiettivi,
            'Destinatari': c.destinatari
        };

        if (isApprovato) {
            Object.assign(riga, {
                'Codice': c.codice || '',
                'Titolo Esteso': c.titolo || '',
                'Edizioni': c.edizioni || 0,
                'Partecipanti Totali': c.partecipanti || 0,
                'Dirigenti': c.dirigenti || 0,
                'Comparto': c.comparto || 0,
                'Uomini Comparto': c.uomini_comparto || 0,
                'Donne Comparto': c.donne_comparto || 0,
                'Uomini Dirigenti': c.uomini_dirigenti || 0,
                'Donne Dirigenti': c.donne_dirigenti || 0,
                'Ore Formazione': minutiToHHMM(c.ore_minuti),
                'Totale Spesa (€)': c.totale_spesa || 0,
                'Comparto Spesa %': c.comparto_spesa_perc || 0,
                'Dirigenti Spesa %': c.dirigenti_spesa_perc || 0,
                'Valutazione ECM': c.valutazione_ecm || 0
            });
        }
        return riga;
    });

    const worksheet = XLSX.utils.json_to_sheet(datiExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Piano Formazione");
    XLSX.writeFile(workbook, `Piano_Formazione_${appState.edizioneCorrenteAnno}.xlsx`);
});

// --- ESPORTAZIONE PDF A3 ORIZZONTALE ---
DOM.btnExportPDF.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    // Layout A3 Orizzontale per contenere tutte le colonne V2
    const doc = new jsPDF('l', 'mm', 'a3');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`PIANO DELLA FORMAZIONE AZIENDALE - EDIZIONE ${appState.edizioneCorrenteAnno} (${appState.edizioneStato.toUpperCase()})`, 14, 15);

    const isApprovato = appState.edizioneStato === 'approvato';

    let colonne = ["LEPTA", "Area", "Segmento", "Argomento", "Valenza", "Tipologia", "Stato"];
    if (isApprovato) {
        colonne.push("Ediz.", "Part.", "Dirig.", "Comp.", "U.Comp", "D.Comp", "U.Dir", "D.Dir", "Ore", "Spesa Tot.", "ECM");
    }

    const righe = appState.corsi.map(c => {
        let base = [c.lepta, c.area, c.segmento_formativo, c.argomento, c.valenza, c.tipologia, c.stato_avanzamento];
        if (isApprovato) {
            base.push(
                c.edizioni || 0,
                c.partecipanti || 0,
                c.dirigenti || 0,
                c.comparto || 0,
                c.uomini_comparto || 0,
                c.donne_comparto || 0,
                c.uomini_dirigenti || 0,
                c.donne_dirigenti || 0,
                minutiToHHMM(c.ore_minuti),
                `€ ${(c.totale_spesa || 0).toFixed(2)}`,
                c.valutazione_ecm || 0
            );
        }
        return base;
    });

    doc.autoTable({
        head: [colonne],
        body: righe,
        startY: 25,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 }
    });

    doc.save(`Piano_Formazione_${appState.edizioneCorrenteAnno}_A3.pdf`);
});

// --- EVENT LISTENERS ---
function setupEventListeners() {
    DOM.selectAnno.addEventListener('change', (e) => setEdizioneCorrente(e.target.value));
    DOM.btnApriForm.addEventListener('click', () => {
        DOM.corsoForm.reset();
        document.getElementById('corso-id').value = '';
        DOM.modalTitle.textContent = "Nuovo Corso di Formazione";
        DOM.corsoModal.classList.remove('hidden');
    });
    DOM.btnChiudiModal.addEventListener('click', () => DOM.corsoModal.classList.add('hidden'));
    DOM.searchInput.addEventListener('input', (e) => { appState.filtri.ricerca = e.target.value; processaEDisplay(); });
    DOM.filterArea.addEventListener('change', (e) => { appState.filtri.area = e.target.value; processaEDisplay(); });
    DOM.filterStato.addEventListener('change', (e) => { appState.filtri.stato = e.target.value; processaEDisplay(); });
}
