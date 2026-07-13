// Inizializzazione client Supabase
const SUPABASE_URL = 'https://zbokkaxvwirinflrquat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_a-Tv3HwY_h27g3UI6U125A_chZ_g2wx';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Stato dell'applicazione
let appState = {
    user: null,
    userRole: 'lettore',
    edizioni: [],
    edizioneCorrenteId: null,
    edizioneCorrenteAnno: null,
    corsi: [],
    filtri: { ricerca: '', area: '', stato: '' },
    sortCampo: 'argomento',
    sortAscending: true
};

// Selettori DOM
const DOM = {
    loginContainer: document.getElementById('login-container'),
    appContainer: document.getElementById('app-container'),
    loginForm: document.getElementById('login-form'),
    logoutBtn: document.getElementById('logout-btn'),
    userDisplay: document.getElementById('user-display'),
    selectAnno: document.getElementById('select-anno'),
    btnClonaAnno: document.getElementById('btn-clona-anno'),
    corsiTbody: document.getElementById('corsi-tbody'),
    btnApriForm: document.getElementById('btn-apri-form'),
    corsoModal: document.getElementById('corso-modal'),
    corsoForm: document.getElementById('corso-form'),
    btnChiudiModal: document.getElementById('btn-chiudi-modal'),
    modalTitle: document.getElementById('modal-title'),
    searchInput: document.getElementById('search-input'),
    filterArea: document.getElementById('filter-area'),
    filterStato: document.getElementById('filter-stato'),
    btnExportExcel: document.getElementById('btn-export-excel'),
    btnExportPDF: document.getElementById('btn-export-pdf')
};

// --- GESTIONE AUTHENTICAZIONE ---
document.addEventListener('DOMContentLoaded', () => {
    initAuthListener();
    setupEventListeners();
});

function initAuthListener() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            appState.user = session.user;
            appState.userRole = session.user.user_metadata.role || 'lettore';
            DOM.loginContainer.classList.add('hidden');
            DOM.appContainer.classList.remove('hidden');
            DOM.userDisplay.textContent = `${session.user.email} (${appState.userRole})`;
            
            if (appState.userRole === 'admin' || appState.userRole === 'responsabile') {
                DOM.btnApriForm.classList.remove('hidden');
                DOM.btnClonaAnno.classList.remove('hidden');
            } else {
                DOM.btnApriForm.classList.add('hidden');
                DOM.btnClonaAnno.classList.add('hidden');
            }
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
    if (error) alert('Errore autenticazione: ' + error.message);
});

DOM.logoutBtn.addEventListener('click', () => supabase.auth.signOut());

// --- CARICAMENTO DATI ---
async function caricaEdizioni() {
    const { data, error } = await supabaseClient.from('edizioni_piano').select('*').order('anno', { ascending: false });
    if (error) return console.error(error);
    
    appState.edizioni = data;
    
    if(data.length === 0) {
        // Se non ci sono edizioni, ne creiamo una iniziale (anno corrente)
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
    appState.edizioneCorrenteAnno = ed ? ed.anno : null;
    caricaCorsi();
}

async function caricaCorsi() {
    if (!appState.edizioneCorrenteId) return;
    const { data, error } = await supabaseClient.from('corsi').select('*').eq('edizione_id', appState.edizioneCorrenteId);
    if (error) return alert('Errore caricamento corsi: ' + error.message);
    appState.corsi = data;
    processaEDisplay();
}

// --- LOGICA FILTRI, ORDINAMENTO E KPI ---
function processaEDisplay() {
    let corsiFiltrati = [...appState.corsi];

    // Ricerca testuale
    if (appState.filtri.ricerca) {
        const query = appState.filtri.ricerca.toLowerCase();
        corsiFiltrati = corsiFiltrati.filter(c => 
            c.argomento.toLowerCase().includes(query) || 
            c.obiettivi.toLowerCase().includes(query) || 
            c.destinatari.toLowerCase().includes(query) ||
            c.segmento_formativo.toLowerCase().includes(query)
        );
    }
    // Filtro Area
    if (appState.filtri.area) {
        corsiFiltrati = corsiFiltrati.filter(c => c.area === appState.filtri.area);
    }
    // Filtro Stato
    if (appState.filtri.stato) {
        corsiFiltrati = corsiFiltrati.filter(c => c.stato_avanzamento === appState.filtri.stato);
    }

    // Ordinamento
    corsiFiltrati.sort((a, b) => {
        let valA = a[appState.sortCampo]?.toString().toLowerCase() || '';
        let valB = b[appState.sortCampo]?.toString().toLowerCase() || '';
        return appState.sortAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    renderTabella(corsiFiltrati);
    calcolaKPI();
}

function renderTabella(listaCorsi) {
    if(listaCorsi.length === 0) {
        DOM.corsiTbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Nessun corso inserito per questa selezione.</td></tr>`;
        return;
    }

    DOM.corsiTbody.innerHTML = listaCorsi.map(c => `
        <tr>
            <td><strong>${c.lepta}</strong></td>
            <td>${c.area}</td>
            <td><small>${c.segmento_formativo}</small></td>
            <td><strong>${c.argomento}</strong></td>
            <td>${c.valenza}</td>
            <td>${c.tipologia}</td>
            <td><span class="badge badge-${c.stato_avanzamento.toLowerCase().replace(' ', '')}">${c.stato_avanzamento}</span></td>
            <td class="actions-col">
                ${(appState.userRole === 'admin' || appState.userRole === 'responsabile') ? `
                    <button class="btn btn-secondary btn-sm" onclick="apriModificaCorso('${c.id}')">Modifica</button>
                    <button class="btn btn-danger btn-sm" onclick="eliminaCorso('${c.id}')">Elimina</button>
                ` : `<span class="text-muted">Sola lettura</span>`}
            </td>
        </tr>
    `).join('');
}

function calcolaKPI() {
    const totale = appState.corsi.length;
    if(totale === 0) {
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

// --- OPERAZIONI CRUD ---
DOM.corsoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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
        creato_da: appState.user.id,
        updated_at: new Date().toISOString()
    };

    if (id) {
        const { error } = await supabaseClient.from('corsi').update(corsoData).eq('id', id);
        if (error) alert(error.message);
    } else {
        const { error } = await supabaseClient.from('corsi').insert([corsoData]);
        if (error) alert(error.message);
    }

    DOM.corsoModal.classList.add('hidden');
    caricaCorsi();
});

window.apriModificaCorso = function(id) {
    const c = appState.corsi.find(item => item.id === id);
    if(!c) return;
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
    
    DOM.modalTitle.textContent = "Modifica Corso di Formazione";
    DOM.corsoModal.classList.remove('hidden');
}

window.eliminaCorso = async function(id) {
    if(!confirm("Sei sicuro di voler eliminare questo corso definitivamente?")) return;
    const { error } = await supabaseClient.from('corsi').delete().eq('id', id);
    if (error) alert(error.message);
    caricaCorsi();
}

// --- CLONAZIONE FINE ANNO ---
DOM.btnClonaAnno.addEventListener('click', async () => {
    const annoSuccessivo = appState.edizioneCorrenteAnno + 1;
    if(!confirm(`Stai per chiudere l'anno ${appState.edizioneCorrenteAnno}. Tutti i corsi in stato 'Pianificato' o 'Annullato' verranno clonati nel nuovo piano annuale ${annoSuccessivo}. Vuoi procedere?`)) return;
    
    const { error } = await supabaseClient.rpc('clona_corsi_anno_successivo', { 
        anno_corrente: appState.edizioneCorrenteAnno, 
        anno_nuovo: annoSuccessivo 
    });

    if (error) {
        alert("Errore durante la migrazione dell'anno: " + error.message);
    } else {
        alert(`Passaggio all'anno ${annoSuccessivo} completato con successo.`);
        caricaEdizioni();
    }
});

// --- ESPORTAZIONI (EXCEL & PDF) ---
DOM.btnExportExcel.addEventListener('click', () => {
    if(appState.corsi.length === 0) return alert("Nessun dato da esportare.");
    
    // Mappatura pulita dei campi per l'export gestionale
    const datiExcel = appState.corsi.map(c => ({
        Anno: appState.edizioneCorrenteAnno,
        LEPTA: c.lepta,
        Area: c.area,
        'Segmento Formativo': c.segmento_formativo,
        Argomento: c.argomento,
        Valenza: c.valenza,
        Tipologia: c.tipologia,
        Stato: c.stato_avanzamento,
        Obiettivi: c.obiettivi,
        Destinatari: c.destinatari
    }));

    const worksheet = XLSX.utils.json_to_sheet(datiExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Piano ${appState.edizioneCorrenteAnno}`);
    XLSX.writeFile(workbook, `Piano_Formazione_${appState.edizioneCorrenteAnno}.xlsx`);
});

DOM.btnExportPDF.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); // Layout orizzontale obbligato per tabelle estese

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`PIANO DELLA FORMAZIONE AZIENDALE - EDIZIONE ${appState.edizioneCorrenteAnno}`, 14, 15);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Report generato il: ${new Date().toLocaleDateString('it-IT')}`, 14, 22);

    const colonne = ["LEPTA", "Area", "Segmento", "Argomento", "Valenza", "Tipologia", "Stato", "Obiettivi / Destinatari"];
    const righe = appState.corsi.map(c => [
        c.lepta,
        c.area,
        c.segmento_formativo,
        c.argomento,
        c.valenza,
        c.tipologia,
        c.stato_avanzamento,
        `OBIETTIVI:\n${c.obiettivi}\n\nDESTINATARI:\n${c.destinatari}`
    ]);

    doc.autoTable({
        head: [colonne],
        body: righe,
        startY: 28,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 9, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 15 },
            1: { cellWidth: 25 },
            2: { cellWidth: 35 },
            3: { cellWidth: 45 },
            4: { cellWidth: 18 },
            5: { cellWidth: 22 },
            6: { cellWidth: 22 },
            7: { cellWidth: 85, fontSize: 8 } // Spazio ampio per il testo multilinea
        },
        styles: { overflow: 'linebreak', cellPadding: 3, valign: 'top' },
        didDrawPage: function (data) {
            // Piè di pagina con numero di pagina
            doc.setFontSize(8);
            doc.text(`Pagina ${data.pageNumber}`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10);
        }
    });

    doc.save(`Piano_Formazione_${appState.edizioneCorrenteAnno}.pdf`);
});

// --- EVENT LISTENERS DI INTERFACCIA ---
function setupEventListeners() {
    DOM.selectAnno.addEventListener('change', (e) => setEdizioneCorrente(e.target.value));
    
    DOM.btnApriForm.addEventListener('click', () => {
        DOM.corsoForm.reset();
        document.getElementById('corso-id').value = '';
        DOM.modalTitle.textContent = "Nuovo Corso di Formazione";
        DOM.corsoModal.classList.remove('hidden');
    });

    DOM.btnChiudiModal.addEventListener('click', () => DOM.corsoModal.classList.add('hidden'));

    DOM.searchInput.addEventListener('input', (e) => {
        appState.filtri.ricerca = e.target.value;
        processaEDisplay();
    });

    DOM.filterArea.addEventListener('change', (e) => {
        appState.filtri.area = e.target.value;
        processaEDisplay();
    });

    DOM.filterStato.addEventListener('change', (e) => {
        appState.filtri.stato = e.target.value;
        processaEDisplay();
    });

    // Ordinamento colonne tabella
    document.querySelectorAll('#corsi-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const campo = th.getAttribute('data-sort');
            if (appState.sortCampo === campo) {
                appState.sortAscending = !appState.sortAscending;
            } else {
                appState.sortCampo = campo;
                appState.sortAscending = true;
            }
            processaEDisplay();
        });
    });
}
