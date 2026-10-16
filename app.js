// ============================================================================
// 5Q Zeitplaner – app.js Version 2.0
// Dashboard: Überschneidungen | Spielerzeiten: 2 Slots pro Tag | Spielerinfos
// ============================================================================

const API_URL = "https://script.google.com/macros/s/AKfycbx9kfAagJcI2RUIvSLUCUpfTZi-wStgIUKzzvgdXcP3UVeDv1oYL4BY8dK1vZSArz2Y/exec";

// DOM Elemente – Navigation
const btnDashboard      = document.getElementById('btn-dashboard');
const btnSpielzeiten    = document.getElementById('btn-spielerzeiten');
const btnInfo           = document.getElementById('btn-info');
const btnLineup         = document.getElementById('btn-lineup');

// DOM Elemente – Views
const viewDashboard     = document.getElementById('view-dashboard');
const viewSpielzeiten   = document.getElementById('view-spielerzeiten');
const viewInfo          = document.getElementById('view-info');
const viewLineup        = document.getElementById('view-lineup');

// DOM Elemente – Inhalte
const syncStatus        = document.getElementById('sync-status');
const spielerZeitenGrid = document.getElementById('spielerzeiten-grid');
const infoGrid          = document.getElementById('info-grid');
const fuenfqContent     = document.getElementById('fuenfq-content');
const teilUeberContent  = document.getElementById('teilueber-content');
const lineupChipsEl     = document.getElementById('lineup-player-chips');
const lineupResultEl    = document.getElementById('lineup-result-panel');
const btnSelectMain5    = document.getElementById('btn-select-main5');
const btnClearSelect    = document.getElementById('btn-clear-selection');

// Wochentage-Konfiguration
const TAGE = [
    { key: 'montag',     label: 'Montag'     },
    { key: 'dienstag',   label: 'Dienstag'   },
    { key: 'mittwoch',   label: 'Mittwoch'   },
    { key: 'donnerstag', label: 'Donnerstag' },
    { key: 'freitag',    label: 'Freitag'    },
    { key: 'samstag',    label: 'Samstag'    },
    { key: 'sonntag',    label: 'Sonntag'    }
];

// ============================================================================
// STATE
// ============================================================================
let teamData         = [];
let spielerInfos     = [];
let ueberschneidungen = {};
let dataLoaded       = false;
let selectedLineupPlayers = [];

// ============================================================================
// NAVIGATION
// ============================================================================
function switchView(activeBtn, activeView) {
    [btnDashboard, btnSpielzeiten, btnInfo, btnLineup].forEach(b => { if (b) b.classList.remove('active'); });
    [viewDashboard, viewSpielzeiten, viewInfo, viewLineup].forEach(v => { if (v) v.classList.remove('active-view'); });
    if (activeBtn) activeBtn.classList.add('active');
    if (activeView) activeView.classList.add('active-view');
}

btnDashboard.addEventListener('click', () => {
    switchView(btnDashboard, viewDashboard);
    if (!dataLoaded) loadData();
});

btnSpielzeiten.addEventListener('click', () => {
    switchView(btnSpielzeiten, viewSpielzeiten);
    if (!dataLoaded) loadData();
});

btnInfo.addEventListener('click', () => {
    switchView(btnInfo, viewInfo);
    if (!dataLoaded) loadData();
});

if (btnLineup) {
    btnLineup.addEventListener('click', () => {
        switchView(btnLineup, viewLineup);
        if (!dataLoaded) loadData();
        else renderLineupSelector();
    });
}

// ============================================================================
// DATEN LADEN
// ============================================================================
async function loadData() {
    try {
        syncStatus.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Lade Daten...';

        const response = await fetch(API_URL);
        const result   = await response.json();

        if (result.status === "success") {
            teamData          = result.zeitplan      || [];
            spielerInfos      = result.spielerInfo   || [];
            ueberschneidungen = result.ueberschneidungen || {};
            dataLoaded        = true;

            syncStatus.innerHTML   = '<i class="fa-solid fa-check"></i> Verbunden';
            syncStatus.style.color = 'var(--success)';

            renderDashboard();
            renderSpielzeiten();
            renderSpielerInfo();
            renderLineupSelector();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error("Fehler beim Laden:", error);
        syncStatus.innerHTML   = '<i class="fa-solid fa-triangle-exclamation"></i> Verbindungsfehler';
        syncStatus.style.color = 'var(--danger)';

        fuenfqContent.innerHTML    = '<p class="no-data-msg">Fehler beim Laden der Daten.</p>';
        teilUeberContent.innerHTML = '<p class="no-data-msg">Fehler beim Laden der Daten.</p>';
        spielerZeitenGrid.innerHTML = '<div class="glass-panel full-width-msg">Fehler beim Laden. Bitte Seite neu laden.</div>';
    }
}

// ============================================================================
// DASHBOARD RENDERN (Überschneidungen)
// ============================================================================
function renderDashboard() {
    // --- 5Q Time ---
    const fq = (ueberschneidungen.fuenfqTime || "").trim();
    if (fq) {
        fuenfqContent.innerHTML = parseOverlapText(fq, true);
    } else {
        fuenfqContent.innerHTML = '<p class="no-data-msg"><i class="fa-solid fa-moon"></i> Diese Woche keine gemeinsame 5Q-Zeit gefunden.</p>';
    }

    // --- Teil-Überschneidungen ---
    const tu = (ueberschneidungen.teilUeberschneidungen || "").trim();
    if (tu) {
        teilUeberContent.innerHTML = parseOverlapText(tu, false);
    } else {
        teilUeberContent.innerHTML = '<p class="no-data-msg"><i class="fa-solid fa-moon"></i> Keine Teil-Überschneidungen gefunden.</p>';
    }
}

/**
 * Parst den Überschneidungstext im Format:
 * **Montag**
 * HH:MM - HH:MM (Spieler...)
 * HH:MM - HH:MM (Spieler...)
 * ---
 * **Dienstag**
 * ...
 */
function parseOverlapText(rawText, isFiveQ) {
    // Nach "---" in Tages-Blöcke aufteilen
    const tagBloecke = rawText.split(/\n---\n/).map(b => b.trim()).filter(b => b);

    if (tagBloecke.length === 0) {
        return '<p class="no-data-msg">Keine Daten vorhanden.</p>';
    }

    let html = '';
    tagBloecke.forEach(tagBlock => {
        // Ersten Teil = Tag-Überschrift (**Montag**), Rest = Zeitblöcke
        const lines = tagBlock.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return;

        // Tag-Name aus **Montag** extrahieren
        const tagMatch = lines[0].match(/^\*\*(.+)\*\*$/);
        const tagName  = tagMatch ? tagMatch[1] : lines[0];
        const zeitLinien = lines.slice(1);

        const iconClass = isFiveQ ? 'fa-trophy' : 'fa-users';
        let zeitBloeckeHtml = '';

        // Jede Zeile kann ein Zeitblock sein: "HH:MM - HH:MM (Spieler)"
        // Mehrere Blöcke pro Tag durch Leerzeilen getrennt (aber wir haben sie schon zeilenweise)
        const bloecke = tagBlock.replace(/^\*\*.+\*\*\n/, '').split(/\n\n+/).map(b => b.trim()).filter(b => b);

        bloecke.forEach(block => {
            const match = block.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*\((.+)\)$/s);
            if (match) {
                const zeitVon = match[1];
                const zeitBis = match[2];
                const spieler = match[3].trim();
                zeitBloeckeHtml += `
                    <div class="overlap-block ${isFiveQ ? 'fiveq' : 'partial'}">
                        <div class="overlap-time">
                            <i class="fa-solid ${iconClass}"></i>
                            <span>${zeitVon} – ${zeitBis}</span>
                        </div>
                        <div class="overlap-players">${spieler}</div>
                    </div>
                `;
            } else if (block) {
                // Roher Text als Fallback (z.B. mehrzeilige Blöcke)
                block.split('\n').forEach(line => {
                    const lm = line.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*\((.+)\)$/);
                    if (lm) {
                        zeitBloeckeHtml += `
                            <div class="overlap-block ${isFiveQ ? 'fiveq' : 'partial'}">
                                <div class="overlap-time">
                                    <i class="fa-solid ${iconClass}"></i>
                                    <span>${lm[1]} – ${lm[2]}</span>
                                </div>
                                <div class="overlap-players">${lm[3].trim()}</div>
                            </div>
                        `;
                    }
                });
            }
        });

        if (zeitBloeckeHtml) {
            html += `
                <div class="tag-section">
                    <div class="tag-section-header"><i class="fa-solid fa-calendar-day"></i> ${tagName}</div>
                    <div class="overlap-blocks">${zeitBloeckeHtml}</div>
                </div>
            `;
        }
    });

    return html || '<p class="no-data-msg">Keine passenden Zeiten gefunden.</p>';
}


// ============================================================================
// SPIELERZEITEN RENDERN (Karten mit Eingabefeldern)
// ============================================================================
function renderSpielzeiten() {
    spielerZeitenGrid.innerHTML = '';

    // Sonderzeilen herausfiltern
    const STOP_KEYWORDS = ['spieler suchen', 'lanewichtung', 'mainhelden', 'mögliche 5q', 'überschneidungen'];
    let filteredTeam = [];
    for (let i = 0; i < teamData.length; i++) {
        const n = (teamData[i].realName || '').toLowerCase();
        if (STOP_KEYWORDS.some(kw => n.includes(kw))) break;
        filteredTeam.push(teamData[i]);
    }

    if (filteredTeam.length === 0) {
        spielerZeitenGrid.innerHTML = '<div class="glass-panel full-width-msg">Keine Spieler gefunden.</div>';
        return;
    }

    filteredTeam.forEach(player => {
        const card = buildSpielerZeitenKarte(player);
        spielerZeitenGrid.appendChild(card);
    });
}

/**
 * Hilfsfunktion: Bereinigt Zeitwerte in valides "HH:mm" für type="time" Inputs.
 * Unterstützt ISO-Strings ("1899-12-30T14:00:00Z"), Punkt-Notation ("12.00"), "HH:mm" und "HH:mm:ss".
 */
function formatTimeInput(val) {
    if (!val && val !== 0) return '';
    const str = String(val).trim();
    if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return '';

    // Falls ISO-Datumsstring (z.B. "1899-12-30T14:00:00Z")
    const isoMatch = str.match(/T(\d{1,2}):(\d{2})/i);
    if (isoMatch) {
        return `${isoMatch[1].padStart(2, '0')}:${isoMatch[2]}`;
    }

    // Falls Zeit mit Punkt (z.B. "12.00" oder "15.30")
    if (/^\d{1,2}\.\d{2}$/.test(str)) {
        const parts = str.split('.');
        return `${parts[0].padStart(2, '0')}:${parts[1]}`;
    }

    // Falls Zeitformat "HH:mm" oder "HH:mm:ss"
    const timeMatch = str.match(/^(\d{1,2}):(\d{2})/);
    if (timeMatch) {
        return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    }

    return '';
}

/**
 * Datum sauber formatieren (Fallback für ISO-Strings von alter API)
 */
function formatTimestamp(raw) {
    if (!raw) return 'Nie aktualisiert';
    if (typeof raw === 'string' && raw.includes('T') && raw.includes('Z')) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        }
    }
    return raw;
}

/**
 * Erstellt eine Spielerkarte mit Zeitfeldern (2 Slots pro Tag) inklusive Vielleicht- & Keine-Zeit-Funktion.
 */
function buildSpielerZeitenKarte(player) {
    const card = document.createElement('div');
    card.className = 'player-card zeit-card';
    const dcName = player.dcName || player.realName || '';
    card.dataset.dcName = dcName;

    const isErsatz = (player.aufstellung || '').toLowerCase().includes('ersatz');

    let tageHtml = '';
    TAGE.forEach(tag => {
        const zeiten = (player.zeiten && player.zeiten[tag.key]) || {};

        let rawS1 = { von: '', bis: '', vielleicht: false };
        let rawS2 = { von: '', bis: '', vielleicht: false };

        if (zeiten.slot1 || zeiten.slot2) {
            rawS1 = Object.assign({}, rawS1, zeiten.slot1);
            rawS2 = Object.assign({}, rawS2, zeiten.slot2);
        } else if (zeiten.von !== undefined || zeiten.bis !== undefined) {
            rawS1.von = zeiten.von || '';
            rawS1.bis = zeiten.bis || '';
            rawS1.vielleicht = !!zeiten.vielleicht;
        }

        const s1von = formatTimeInput(rawS1.von);
        const s1bis = formatTimeInput(rawS1.bis);
        const s1Vb  = !!rawS1.vielleicht;

        const s2von = formatTimeInput(rawS2.von);
        const s2bis = formatTimeInput(rawS2.bis);
        const s2Vb  = !!rawS2.vielleicht;

        const isDayEmpty = (!s1von && !s1bis && !s2von && !s2bis);

        tageHtml += `
            <div class="tag-block ${isDayEmpty ? 'is-no-time' : ''}" data-day="${tag.key}">
                <div class="tag-block-header">
                    <div class="tag-label">${tag.label.substring(0, 2)}<span class="tag-label-full">${tag.label.substring(2)}</span></div>
                    <div class="tag-actions">
                        <button type="button" class="btn-clear-day" title="Keine Zeit (Tag leeren)" onclick="clearDayTimes(this, '${tag.key}')">
                            <i class="fa-solid fa-ban"></i> Keine Zeit
                        </button>
                    </div>
                </div>
                <div class="slots">
                    <div class="slot">
                        <input type="time" class="time-input" data-tag="${tag.key}" data-slot="1" data-type="von" value="${s1von}" placeholder="--:--">
                        <span class="slot-sep">–</span>
                        <input type="time" class="time-input" data-tag="${tag.key}" data-slot="1" data-type="bis" value="${s1bis}" placeholder="--:--">
                        <button type="button" class="btn-vielleicht-toggle ${s1Vb ? 'active' : ''}" data-tag="${tag.key}" data-slot="1" onclick="toggleVielleicht(this)" title="Status: Vielleicht / Unsicher">
                            ? VB
                        </button>
                    </div>
                    <div class="slot">
                        <input type="time" class="time-input" data-tag="${tag.key}" data-slot="2" data-type="von" value="${s2von}" placeholder="--:--">
                        <span class="slot-sep">–</span>
                        <input type="time" class="time-input" data-tag="${tag.key}" data-slot="2" data-type="bis" value="${s2bis}" placeholder="--:--">
                        <button type="button" class="btn-vielleicht-toggle ${s2Vb ? 'active' : ''}" data-tag="${tag.key}" data-slot="2" onclick="toggleVielleicht(this)" title="Status: Vielleicht / Unsicher">
                            ? VB
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    const badgeClass = getRoleBadgeClass(player.aufstellung);

    card.innerHTML = `
        <div class="player-header">
            <div class="player-info">
                <h3>${player.realName || player.dcName}</h3>
                <p>${player.dcName && player.realName && player.dcName.toLowerCase() !== player.realName.toLowerCase() ? '@' + player.dcName : ''}</p>
            </div>
            <div class="role-badge ${badgeClass}">${player.aufstellung || 'Mainspieler'}</div>
        </div>
        <div class="tage-grid">
            ${tageHtml}
        </div>
        <div class="card-footer">
            <small class="last-update"><i class="fa-solid fa-clock-rotate-left"></i> ${formatTimestamp(player.aktualisiertAm)}</small>
            <button class="btn-save">
                <i class="fa-solid fa-floppy-disk"></i> Speichern
            </button>
        </div>
        <div class="save-msg hidden"></div>
    `;

    // Explizit .value für type="time" Inputs setzen
    card.querySelectorAll('.time-input').forEach(input => {
        const v = input.getAttribute('value');
        if (v) input.value = v;

        input.addEventListener('change', () => {
            const dayBlock = input.closest('.tag-block');
            const inputs = dayBlock.querySelectorAll('.time-input');
            const hasAny = Array.from(inputs).some(inp => inp.value);
            if (hasAny) {
                dayBlock.classList.remove('is-no-time');
            } else {
                dayBlock.classList.add('is-no-time');
            }
        });
    });

    // Event-Listener an den Speichern-Button binden
    const saveBtn = card.querySelector('.btn-save');
    saveBtn.addEventListener('click', () => speichereSpielzeiten(player, card, saveBtn));

    return card;
}

// Schnelltaste "Keine Zeit" für einen Tag
window.clearDayTimes = function(btnEl, tagKey) {
    const dayBlock = btnEl.closest('.tag-block');
    if (!dayBlock) return;
    dayBlock.querySelectorAll('.time-input').forEach(inp => {
        inp.value = '';
    });
    dayBlock.querySelectorAll('.btn-vielleicht-toggle').forEach(vb => {
        vb.classList.remove('active');
    });
    dayBlock.classList.add('is-no-time');
};

// Toggle für Status "Vielleicht"
window.toggleVielleicht = function(btnEl) {
    btnEl.classList.toggle('active');
    const dayBlock = btnEl.closest('.tag-block');
    const anyVb = dayBlock.querySelector('.btn-vielleicht-toggle.active');
    if (anyVb) {
        dayBlock.classList.add('has-vielleicht');
    } else {
        dayBlock.classList.remove('has-vielleicht');
    }
};

// ============================================================================
// ZEITEN SPEICHERN (POST)
// ============================================================================
async function speichereSpielzeiten(player, card, btnEl) {
    const dcName   = (player.dcName || '').trim();
    const realName = (player.realName || '').trim();
    const msgEl    = card.querySelector('.save-msg');

    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichere...';

    const zeiten = {};
    TAGE.forEach(tag => {
        const s1von = card.querySelector(`input[data-tag="${tag.key}"][data-slot="1"][data-type="von"]`)?.value || '';
        const s1bis = card.querySelector(`input[data-tag="${tag.key}"][data-slot="1"][data-type="bis"]`)?.value || '';
        const s1vb  = card.querySelector(`.btn-vielleicht-toggle[data-tag="${tag.key}"][data-slot="1"]`)?.classList.contains('active') || false;

        const s2von = card.querySelector(`input[data-tag="${tag.key}"][data-slot="2"][data-type="von"]`)?.value || '';
        const s2bis = card.querySelector(`input[data-tag="${tag.key}"][data-slot="2"][data-type="bis"]`)?.value || '';
        const s2vb  = card.querySelector(`.btn-vielleicht-toggle[data-tag="${tag.key}"][data-slot="2"]`)?.classList.contains('active') || false;

        zeiten[tag.key] = {
            von: s1von,
            bis: s1bis,
            vielleicht: s1vb,
            slot1: { von: s1von, bis: s1bis, vielleicht: s1vb },
            slot2: { von: s2von, bis: s2bis, vielleicht: s2vb }
        };
    });

    const payload = {
        action: "saveZeiten",
        dcName: dcName,
        realName: realName,
        zeiten: zeiten
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();

        if (result.status === "success") {
            showCardMsg(msgEl, '✅ Gespeichert!', 'success');
            player.zeiten = zeiten;
            const now = new Date();
            player.aktualisiertAm = now.toLocaleDateString('de-DE') + ' ' + now.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
            const lastUpdateEl = card.querySelector('.last-update');
            if (lastUpdateEl) lastUpdateEl.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> ${player.aktualisiertAm}`;
        } else {
            throw new Error(result.message || 'Unbekannter Fehler');
        }
    } catch (err) {
        showCardMsg(msgEl, '❌ Fehler: ' + err.message, 'error');
    } finally {
        btnEl.disabled = false;
        btnEl.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Speichern';
    }
}

function showCardMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `save-msg ${type}`;
    setTimeout(() => { el.className = 'save-msg hidden'; }, 4000);
}

// ============================================================================
// SPIELERINFOS RENDERN & EDITIEREN (LANES & 4 HELDEN)
// ============================================================================
const LANES_ORDER = ['Roam', 'Midlane', 'Jungle', 'Explane', 'Goldlane'];

// Hilfsfunktion: Ermittelt die Rangfolge/Priorität eines Spielers
function getPlayerPriority(aufstellung) {
    const s = (aufstellung || '').toLowerCase().trim();
    if (s.includes('ersatzspieler 1') || s === 'ersatz 1') return 2;
    if (s.includes('ersatzspieler 2') || s === 'ersatz 2') return 3;
    if (s.includes('ersatzspieler 3') || s === 'ersatz 3') return 4;
    if (s.includes('ersatzspieler 4') || s === 'ersatz 4') return 5;
    if (s.includes('ersatzspieler 5') || s === 'ersatz 5') return 6;
    if (s.includes('ersatz')) return 7;
    return 1; // Mainspieler
}

// Hilfsfunktion: Gibt die passende CSS-Klasse für das Aufstellungs-Badge zurück
function getRoleBadgeClass(aufstellung) {
    const p = getPlayerPriority(aufstellung);
    if (p === 1) return '';
    if (p >= 2 && p <= 6) return `sub-role sub-${p - 1}`;
    return 'sub-role';
}

function getConsolidatedPlayerList() {
    const STOP_KEYWORDS = ['spieler suchen', 'lanewichtung', 'mainhelden', 'mögliche 5q', 'überschneidungen'];
    const cardsToRender = [];
    const seenKeys = new Set();

    teamData.forEach(p => {
        const r = (p.realName || '').trim();
        const d = (p.dcName || '').trim();
        const rLower = r.toLowerCase();
        if (rLower.startsWith('spieler ') || STOP_KEYWORDS.some(kw => rLower.includes(kw))) return;
        if (!r && !d) return;

        const pReal = r.toLowerCase();
        const pDc   = d.toLowerCase();
        const key   = pDc || pReal;

        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        if (pReal) seenKeys.add(pReal);

        const matchedInfo = spielerInfos.find(info => {
            const iReal = (info.realName || '').toLowerCase();
            const iDc   = (info.dcName || '').toLowerCase();
            return (iReal && (iReal === pReal || iReal === pDc)) ||
                   (iDc && (iDc === pDc || iDc === pReal));
        });

        cardsToRender.push({
            realName: r || (matchedInfo && matchedInfo.realName) || d,
            dcName: d || (matchedInfo && matchedInfo.dcName) || r,
            aufstellung: p.aufstellung || (matchedInfo && matchedInfo.aufstellung) || 'Mainspieler',
            lanewichtung: (matchedInfo && matchedInfo.lanewichtung) || {},
            mainhelden: (matchedInfo && matchedInfo.mainhelden) || {}
        });
    });

    spielerInfos.forEach(info => {
        const iReal = (info.realName || '').trim();
        const iDc   = (info.dcName || '').trim();
        const iKey  = (iDc || iReal).toLowerCase();
        if (!iKey || iKey.startsWith('spieler ') || STOP_KEYWORDS.some(kw => iKey.includes(kw))) return;

        if (!seenKeys.has(iKey) && !(iReal && seenKeys.has(iReal.toLowerCase()))) {
            seenKeys.add(iKey);
            if (iReal) seenKeys.add(iReal.toLowerCase());
            cardsToRender.push({
                realName: iReal || iDc,
                dcName: iDc || iReal,
                aufstellung: info.aufstellung || 'Mainspieler',
                lanewichtung: info.lanewichtung || {},
                mainhelden: info.mainhelden || {}
            });
        }
    });

    // Nach Priorität sortieren: Mainspieler zuerst, dann Ersatz 1 bis 5
    cardsToRender.sort((a, b) => {
        const pa = getPlayerPriority(a.aufstellung);
        const pb = getPlayerPriority(b.aufstellung);
        return pa - pb;
    });

    return cardsToRender;
}

function renderSpielerInfo() {
    infoGrid.innerHTML = '';
    const players = getConsolidatedPlayerList();

    if (players.length === 0) {
        infoGrid.innerHTML = '<div class="glass-panel full-width-msg">Keine Spielerinformationen gefunden.</div>';
        return;
    }

    players.forEach(info => {
        const card = createPlayerInfoCard(info);
        infoGrid.appendChild(card);
    });
}

function createPlayerInfoCard(info) {
    const card = document.createElement('div');
    card.className = 'player-card';

    renderPlayerInfoViewMode(card, info);
    return card;
}

// Ansichtsmodus einer Spielerinfo-Karte
function renderPlayerInfoViewMode(card, info) {
    const w = info.lanewichtung || {};
    const h = info.mainhelden   || {};

    let bestLane = '';
    let bestVal  = -1;
    LANES_ORDER.forEach(lane => {
        if ((w[lane] || 0) > bestVal) { bestVal = w[lane] || 0; bestLane = lane; }
    });

    let lanesHtml = '<ul class="schedule-list lane-list">';
    LANES_ORDER.forEach(lane => {
        const weight  = w[lane] || 0;
        const heroes  = (h[lane] || []).join(', ') || '–';
        const isMain  = (lane === bestLane && weight > 0);
        const barW    = Math.round((weight / 10) * 100);

        lanesHtml += `
            <li class="lane-item ${isMain ? 'main-lane' : ''}">
                <div class="lane-header-row">
                    <strong>${lane}</strong>
                    <span class="weight-badge">${weight}/10${isMain ? ' ⭐' : ''}</span>
                </div>
                <div class="weight-bar-bg"><div class="weight-bar-fill" style="width:${barW}%"></div></div>
                <small class="lane-heroes"><i class="fa-solid fa-khanda"></i> ${heroes}</small>
            </li>
        `;
    });
    lanesHtml += '</ul>';

    const hasDistinctDc = info.dcName && info.realName && info.dcName.toLowerCase() !== info.realName.toLowerCase();
    const dcSubtitle = hasDistinctDc ? `<p>@${info.dcName}</p>` : '';
    const badgeClass = getRoleBadgeClass(info.aufstellung);

    card.innerHTML = `
        <div class="player-header">
            <div class="player-info">
                <h3>${info.realName || info.dcName}</h3>
                ${dcSubtitle}
            </div>
            <div class="player-header-actions">
                <div class="role-badge ${badgeClass}">${info.aufstellung || 'Mainspieler'}</div>
                <button class="btn-edit-identity" title="Name & Ersatz-Rolle bearbeiten"><i class="fa-solid fa-user-pen"></i></button>
                <button class="btn-edit-info" title="Lanes & Helden bearbeiten"><i class="fa-solid fa-pen-to-square"></i></button>
            </div>
        </div>
        ${lanesHtml}
        <div class="save-msg hidden"></div>
    `;

    card.querySelector('.btn-edit-info').addEventListener('click', () => {
        renderPlayerInfoEditMode(card, info);
    });

    card.querySelector('.btn-edit-identity').addEventListener('click', () => {
        renderPlayerIdentityEditMode(card, info);
    });
}

// Bearbeitungsmodus für Namen (Ingame, Discord) und Aufstellung (Main / Ersatzspieler 1-5)
function renderPlayerIdentityEditMode(card, info) {
    const currentReal = info.realName || '';
    const currentDc   = info.dcName || '';
    const currentAuf  = info.aufstellung || 'Mainspieler';

    card.innerHTML = `
        <div class="player-header">
            <div class="player-info">
                <h3>Spielerdaten bearbeiten</h3>
                <p>Namen & Ersatzspieler-Rolle anpassen</p>
            </div>
        </div>
        <div class="identity-edit-box">
            <div class="identity-field-group">
                <label>Ingame / Real-Name:</label>
                <input type="text" class="identity-input inp-edit-real" value="${currentReal}" placeholder="z. B. Max oder Ingame-Name">
            </div>
            <div class="identity-field-group">
                <label>Discord-Name (@):</label>
                <input type="text" class="identity-input inp-edit-dc" value="${currentDc}" placeholder="z. B. max_dc">
            </div>
            <div class="identity-field-group">
                <label>Aufstellung / Rolle:</label>
                <select class="identity-select sel-edit-aufstellung">
                    <option value="Mainspieler" ${currentAuf === 'Mainspieler' ? 'selected' : ''}>⭐ Mainspieler (Stamm)</option>
                    <option value="Ersatzspieler 1" ${currentAuf === 'Ersatzspieler 1' ? 'selected' : ''}>1️⃣ Ersatzspieler 1 (1. Prio)</option>
                    <option value="Ersatzspieler 2" ${currentAuf === 'Ersatzspieler 2' ? 'selected' : ''}>2️⃣ Ersatzspieler 2 (2. Prio)</option>
                    <option value="Ersatzspieler 3" ${currentAuf === 'Ersatzspieler 3' ? 'selected' : ''}>3️⃣ Ersatzspieler 3 (3. Prio)</option>
                    <option value="Ersatzspieler 4" ${currentAuf === 'Ersatzspieler 4' ? 'selected' : ''}>4️⃣ Ersatzspieler 4 (4. Prio)</option>
                    <option value="Ersatzspieler 5" ${currentAuf === 'Ersatzspieler 5' ? 'selected' : ''}>5️⃣ Ersatzspieler 5 (5. Prio)</option>
                </select>
            </div>
        </div>
        <div class="edit-actions-row">
            <button class="btn-cancel-edit"><i class="fa-solid fa-xmark"></i> Abbrechen</button>
            <button class="btn-save btn-save-identity"><i class="fa-solid fa-floppy-disk"></i> Speichern</button>
        </div>
        <div class="save-msg hidden"></div>
    `;

    card.querySelector('.btn-cancel-edit').addEventListener('click', () => {
        renderPlayerInfoViewMode(card, info);
    });

    card.querySelector('.btn-save-identity').addEventListener('click', async () => {
        const btnSave = card.querySelector('.btn-save-identity');
        const msgEl   = card.querySelector('.save-msg');

        const newReal = card.querySelector('.inp-edit-real').value.trim();
        const newDc   = card.querySelector('.inp-edit-dc').value.trim();
        const newAuf  = card.querySelector('.sel-edit-aufstellung').value;

        if (!newReal && !newDc) {
            showCardMsg(msgEl, '❌ Bitte mindestens einen Namen angeben!', 'error');
            return;
        }

        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichere...';

        try {
            const payload = {
                action: "savePlayerIdentity",
                oldRealName: currentReal,
                oldDcName: currentDc,
                newRealName: newReal,
                newDcName: newDc,
                newAufstellung: newAuf
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            const result = await response.json();

            if (result.status === "success") {
                // Lokale Objekte aktualisieren
                info.realName = newReal;
                info.dcName   = newDc;
                info.aufstellung = newAuf;

                const matchTeam = teamData.find(t => (t.realName === currentReal || t.dcName === currentDc));
                if (matchTeam) {
                    matchTeam.realName = newReal;
                    matchTeam.dcName   = newDc;
                    matchTeam.aufstellung = newAuf;
                }

                const matchInfo = spielerInfos.find(si => (si.realName === currentReal || si.dcName === currentDc));
                if (matchInfo) {
                    matchInfo.realName = newReal;
                    matchInfo.dcName   = newDc;
                    matchInfo.aufstellung = newAuf;
                }

                renderPlayerInfoViewMode(card, info);
                const viewMsg = card.querySelector('.save-msg');
                showCardMsg(viewMsg, '✅ Spielerdaten im Sheet aktualisiert!', 'success');

                // Aktualisiere auch andere Bereiche (Zeiten & Lineup)
                renderSpielzeiten();
                renderLineupSelector();
            } else {
                throw new Error(result.message || 'Fehler beim Speichern');
            }
        } catch (err) {
            showCardMsg(msgEl, '❌ ' + err.message, 'error');
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Speichern';
        }
    });
}

// Bearbeitungsmodus einer Spielerinfo-Karte (Lanes & Helden bearbeiten)
function renderPlayerInfoEditMode(card, info) {
    const w = Object.assign({}, info.lanewichtung || {});
    const h = Object.assign({}, info.mainhelden || {});

    // Gesamte Punkte berechnen
    let totalPoints = 0;
    LANES_ORDER.forEach(l => { totalPoints += parseInt(w[l] || 0, 10); });

    let lanesEditHtml = '';
    LANES_ORDER.forEach(lane => {
        const val = w[lane] !== undefined ? w[lane] : 0;
        const heroes = h[lane] || [];

        lanesEditHtml += `
            <div class="lane-edit-item" data-lane="${lane}">
                <div class="lane-edit-header">
                    <strong>${lane}</strong>
                    <input type="number" class="lane-weight-input" min="0" max="10" value="${val}" data-lane="${lane}">
                </div>
                <div class="heroes-edit-grid">
                    <input type="text" class="hero-edit-input" placeholder="1. Held" value="${heroes[0] || ''}" data-lane="${lane}" data-index="0">
                    <input type="text" class="hero-edit-input" placeholder="2. Held" value="${heroes[1] || ''}" data-lane="${lane}" data-index="1">
                    <input type="text" class="hero-edit-input" placeholder="3. Held" value="${heroes[2] || ''}" data-lane="${lane}" data-index="2">
                    <input type="text" class="hero-edit-input" placeholder="4. Held" value="${heroes[3] || ''}" data-lane="${lane}" data-index="3">
                </div>
            </div>
        `;
    });

    card.innerHTML = `
        <div class="player-header">
            <div class="player-info">
                <h3>${info.realName || info.dcName} bearbeiten</h3>
                <p>Lanewichtungen (0–10) & 4 Helden je Lane</p>
            </div>
        </div>
        <div class="lane-points-counter">
            <span>Punkte vergeben (Ziel: 25):</span>
            <strong class="points-val ${totalPoints === 25 ? 'valid' : 'invalid'}">${totalPoints} / 25</strong>
        </div>
        <div class="lanes-edit-container">
            ${lanesEditHtml}
        </div>
        <div class="edit-actions-row">
            <button class="btn-cancel-edit"><i class="fa-solid fa-xmark"></i> Abbrechen</button>
            <button class="btn-save btn-save-info"><i class="fa-solid fa-floppy-disk"></i> Speichern</button>
        </div>
        <div class="save-msg hidden"></div>
    `;

    // Live-Update des Punktezählers
    const pointsValEl = card.querySelector('.points-val');
    card.querySelectorAll('.lane-weight-input').forEach(inp => {
        inp.addEventListener('input', () => {
            let sum = 0;
            card.querySelectorAll('.lane-weight-input').forEach(i => {
                sum += Math.max(0, Math.min(10, parseInt(i.value || 0, 10)));
            });
            pointsValEl.textContent = `${sum} / 25`;
            if (sum === 25) {
                pointsValEl.className = 'points-val valid';
            } else {
                pointsValEl.className = 'points-val invalid';
            }
        });
    });

    // Abbrechen
    card.querySelector('.btn-cancel-edit').addEventListener('click', () => {
        renderPlayerInfoViewMode(card, info);
    });

    // Speichern
    card.querySelector('.btn-save-info').addEventListener('click', async () => {
        const btnSave = card.querySelector('.btn-save-info');
        const msgEl   = card.querySelector('.save-msg');

        const newWeights = {};
        card.querySelectorAll('.lane-weight-input').forEach(inp => {
            const l = inp.dataset.lane;
            newWeights[l] = Math.max(0, Math.min(10, parseInt(inp.value || 0, 10)));
        });

        const newHeroes = {};
        LANES_ORDER.forEach(l => { newHeroes[l] = ['', '', '', '']; });
        card.querySelectorAll('.hero-edit-input').forEach(inp => {
            const l   = inp.dataset.lane;
            const idx = parseInt(inp.dataset.index, 10);
            newHeroes[l][idx] = inp.value.trim();
        });

        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichere...';

        try {
            const payload = {
                action: "saveSpielerInfo",
                dcName: info.dcName,
                realName: info.realName,
                lanewichtung: newWeights,
                mainhelden: newHeroes
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            const result = await response.json();

            if (result.status === "success") {
                info.lanewichtung = newWeights;
                info.mainhelden   = newHeroes;

                // Auch im globalen spielerInfos aktualisieren
                const matchGlobal = spielerInfos.find(si => (si.dcName === info.dcName || si.realName === info.realName));
                if (matchGlobal) {
                    matchGlobal.lanewichtung = newWeights;
                    matchGlobal.mainhelden   = newHeroes;
                }

                renderPlayerInfoViewMode(card, info);
                const viewMsg = card.querySelector('.save-msg');
                showCardMsg(viewMsg, '✅ Spielerinfo im Sheet gespeichert!', 'success');

                // Rollen-Planer neu aktualisieren
                if (selectedLineupPlayers.length === 5) {
                    calculateOptimalLineup(selectedLineupPlayers);
                }
            } else {
                throw new Error(result.message || 'Fehler beim Speichern');
            }
        } catch (err) {
            showCardMsg(msgEl, '❌ ' + err.message, 'error');
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Speichern';
        }
    });
}

// ============================================================================
// ROLLEN-ENTSCHEIDER & LINEUP-RECHNER (Echtzeit-Optimierung)
// ============================================================================
function renderLineupSelector() {
    if (!lineupChipsEl) return;
    lineupChipsEl.innerHTML = '';

    const players = getConsolidatedPlayerList();
    if (players.length === 0) return;

    // Standard-Auswahl: Die ersten 5 Spieler vorwählen
    if (selectedLineupPlayers.length === 0) {
        selectedLineupPlayers = players.slice(0, 5).map(p => p.realName || p.dcName);
    }

    players.forEach(p => {
        const pName = p.realName || p.dcName;
        const chip  = document.createElement('div');
        const isSelected = selectedLineupPlayers.includes(pName);
        const pPriority = getPlayerPriority(p.aufstellung);
        const tagSub = pPriority === 1 ? '' : `<small style="opacity:0.75; font-size:0.72rem; margin-left:0.25rem;">(Ersatz ${pPriority - 1})</small>`;

        chip.className = `player-chip ${isSelected ? 'selected' : ''}`;
        chip.innerHTML = `<i class="fa-solid ${isSelected ? 'fa-circle-check' : 'fa-circle'}"></i> ${pName} ${tagSub}`;

        chip.addEventListener('click', () => {
            if (selectedLineupPlayers.includes(pName)) {
                selectedLineupPlayers = selectedLineupPlayers.filter(x => x !== pName);
            } else {
                if (selectedLineupPlayers.length >= 5) {
                    // Ersetze ältesten Eintrag oder verhindere > 5
                    selectedLineupPlayers.shift();
                }
                selectedLineupPlayers.push(pName);
            }
            renderLineupSelector();
            calculateOptimalLineup(selectedLineupPlayers);
        });

        lineupChipsEl.appendChild(chip);
    });

    if (btnSelectMain5) {
        btnSelectMain5.onclick = () => {
            selectedLineupPlayers = players.slice(0, 5).map(p => p.realName || p.dcName);
            renderLineupSelector();
            calculateOptimalLineup(selectedLineupPlayers);
        };
    }

    if (btnClearSelect) {
        btnClearSelect.onclick = () => {
            selectedLineupPlayers = [];
            renderLineupSelector();
            calculateOptimalLineup(selectedLineupPlayers);
        };
    }

    calculateOptimalLineup(selectedLineupPlayers);
}

// Permutations-Algorithmus zur Zuweisung optimaler Lanes
function calculateOptimalLineup(chosenNames) {
    if (!lineupResultEl) return;

    if (!chosenNames || chosenNames.length < 5) {
        lineupResultEl.innerHTML = `
            <div class="glass-panel full-width-msg">
                <i class="fa-solid fa-hand-pointer"></i> Bitte wähle noch ${5 - chosenNames.length} Spieler aus (aktuell: ${chosenNames.length}/5).
            </div>
        `;
        return;
    }

    const allPlayers = getConsolidatedPlayerList();
    const playerMap = {};
    allPlayers.forEach(p => {
        playerMap[(p.realName || '').toLowerCase()] = p;
        playerMap[(p.dcName || '').toLowerCase()] = p;
    });

    const lanes = ['Roam', 'Midlane', 'Jungle', 'Explane', 'Goldlane'];

    function permute(arr) {
        if (arr.length === 0) return [[]];
        const res = [];
        for (let i = 0; i < arr.length; i++) {
            const rest = permute(arr.slice(0, i).concat(arr.slice(i + 1)));
            for (let j = 0; j < rest.length; j++) res.push([arr[i]].concat(rest[j]));
        }
        return res;
    }

    const lanePerms = permute(lanes);
    let bestPerm = null;
    let maxOverallEval = -99999999;
    let bestRawScore = 0;

    for (let p = 0; p < lanePerms.length; p++) {
        const currentLanes = lanePerms[p];
        let rawScore = 0;
        let penalty  = 0;
        const currentMap = {};

        for (let i = 0; i < 5; i++) {
            const pName = chosenNames[i];
            const assignedLane = currentLanes[i];
            const pObj = playerMap[pName.toLowerCase()] || { lanewichtung: {} };
            const weights = pObj.lanewichtung || {};

            const primaryWeight = weights[assignedLane] !== undefined ? weights[assignedLane] : 0;
            let playerBestWeight = 0;
            for (const l in weights) {
                if (weights[l] > playerBestWeight) playerBestWeight = weights[l];
            }

            rawScore += primaryWeight;
            const diff = playerBestWeight - primaryWeight;
            if (playerBestWeight === 10)    penalty += diff * diff * 100000;
            else if (playerBestWeight >= 8) penalty += diff * diff * 10000;
            else                            penalty += diff * diff * 100;

            currentMap[pName] = assignedLane;
        }

        const evaluation = (rawScore * 10000) - penalty;
        if (evaluation > maxOverallEval) {
            maxOverallEval = evaluation;
            bestRawScore   = rawScore;
            bestPerm       = currentMap;
        }
    }

    // Lane-Icons
    const LANE_ICONS = {
        Roam:     'fa-solid fa-shield',
        Midlane:  'fa-solid fa-wand-magic-sparkles',
        Jungle:   'fa-solid fa-paw',
        Explane:  'fa-solid fa-hand-fist',
        Goldlane: 'fa-solid fa-coins'
    };

    let lanesCardsHtml = '';
    lanes.forEach(lane => {
        // Finde den Spieler für diese Lane
        const assignedPlayerName = Object.keys(bestPerm).find(pName => bestPerm[pName] === lane);
        const pObj = playerMap[assignedPlayerName.toLowerCase()] || { lanewichtung: {}, mainhelden: {} };
        const weight = (pObj.lanewichtung && pObj.lanewichtung[lane]) || 0;
        const heroes = (pObj.mainhelden && pObj.mainhelden[lane]) || [];

        const heroesPills = heroes.filter(h => h).map(h => `<span class="hero-tag">${h}</span>`).join('') || '<span style="color:var(--text-muted); font-size:0.75rem;">Keine Helden hinterlegt</span>';

        lanesCardsHtml += `
            <div class="lineup-lane-card">
                <div>
                    <div class="lineup-lane-header">
                        <div class="lineup-lane-name"><i class="${LANE_ICONS[lane] || 'fa-solid fa-gamepad'}"></i> ${lane}</div>
                        <span class="weight-badge">${weight}/10</span>
                    </div>
                    <div class="lineup-player-assigned">
                        <h4>${assignedPlayerName}</h4>
                        <p>${pObj.dcName && pObj.dcName !== assignedPlayerName ? '@' + pObj.dcName : 'Lane-Main'}</p>
                    </div>
                </div>
                <div class="lineup-lane-heroes-box">
                    <small><i class="fa-solid fa-khanda"></i> 4 Haupthelden</small>
                    <div class="lineup-heroes-tags">
                        ${heroesPills}
                    </div>
                </div>
            </div>
        `;
    });

    const percent = Math.round((bestRawScore / 50) * 100);

    lineupResultEl.innerHTML = `
        <div class="glass-panel lineup-summary-bar">
            <div class="lineup-score-tag">
                <i class="fa-solid fa-award" style="color:var(--accent-gold)"></i>
                Team-Synergie: <span class="score-num">${bestRawScore} / 50</span> Punkte (${percent}%)
            </div>
            <div style="font-size:0.85rem; color:var(--text-muted);">
                Optimale Rollenaufteilung ohne Lane-Konflikte berechnet
            </div>
        </div>
        <div class="lineup-lanes-grid">
            ${lanesCardsHtml}
        </div>
    `;
}

// ============================================================================
// INITIALER LOAD
// ============================================================================
loadData();
