// ==UserScript==
// @name         Emoji + Seriennummer + animierter Spinner (ohne Prefix) + Benachrichtigung
// @namespace    http://tampermonkey.net/
// @version      5.7
// @description  Zeigt im Tabtitel bei Ladevorgängen den Spinner (⠋⠙…). Bei neuer Big-Box-Upgrade-UI zusätzlich die Prozentzahl (z. B. 73%). Statisch: 🟢/🔴 + Seriennummer. Benachrichtigt nur bei Erfolg oder Fehler. Klick auf Notification fokussiert den Tab und scrollt zur Upgrade-Box. Favicon unverändert. Intervall: 250 ms.
// @match        *://eu.sofarcloud.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ─── KONFIG ──────────────────────────────────────────────────────────────────
    const spinnerFrames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
    const intervalMs = 250;
    // ─────────────────────────────────────────────────────────────────────────────

    let lastStaticTitle = "";
    let lastUrl = location.href;
    let lastStatusText = "";
    let spinnerIndex = 0;

    // Notification-Erlaubnis anfragen (leise)
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        Notification.requestPermission().catch(()=>{});
    }

    function getSerialNumber() {
        const m = location.href.match(/deviceDetail\/([^?]+)/);
        return m ? m[1] : "SofarCloud";
    }

    function rgbToHex(rgb) {
        if (!rgb) return "#404040";
        const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!m) return "#404040";
        return "#" + [m[1],m[2],m[3]].map(x=>(+x).toString(16).padStart(2,'0')).join('');
    }

    function colorToEmoji(hex) {
        hex = (hex || "").toLowerCase();
        if (hex === "#44b979") return "🟢";
        if (["#ff0000","#ee4d4d","#ef4d4d"].includes(hex)) return "🔴";
        return "";
    }

    function colorToText(hex) {
        hex = (hex || "").toLowerCase();
        if (hex === "#44b979") return "Erfolg";
        if (["#ff0000","#ee4d4d","#ef4d4d"].includes(hex)) return "Gescheitert";
        if (hex === "#ffa500") return "In Arbeit";
        return "Kein Ergebnis";
    }

    // ─── erkennt, ob die neue Big-Box-Upgrade-UI aktiv lädt ─────────────────────
    function isBigBoxUpdating() {
        try {
            const bigBox = document.querySelector('.big-box');
            if (!bigBox) return false;

            // 1) Text "Upgrade wird ausgeführt..."
            const underway = bigBox.querySelector('.upgrade-tip.underWay');
            if (underway && underway.textContent.toLowerCase().includes("upgrade wird ausgeführt")) {
                return true;
            }

            // 2) Prozent < 100 in der Big-Box
            const progressText = bigBox.querySelector('.demo-progress .el-progress__text');
            if (progressText) {
                const m = progressText.textContent.match(/(\d+)%/);
                if (m) {
                    const pct = parseInt(m[1], 10);
                    if (!Number.isNaN(pct) && pct >= 0 && pct < 100) return true;
                }
            }

            // 3) Fallback: style width < 100%
            const barInner = bigBox.querySelector('.demo-progress .el-progress-bar__inner');
            if (barInner && barInner.getAttribute('style')) {
                const wm = barInner.getAttribute('style').match(/width:\s*([\d.]+)%/i);
                if (wm) {
                    const w = parseFloat(wm[1]);
                    if (!Number.isNaN(w) && w >= 0 && w < 100) return true;
                }
            }
        } catch {}
        return false;
    }

    // ─── liest die Prozentzahl ausschließlich aus der Big-Box-UI ─────────────────
    function getBigBoxProgress() {
        try {
            const bigBox = document.querySelector('.big-box');
            if (!bigBox) return null;

            // bevorzugt Text "73%"
            const progressText = bigBox.querySelector('.demo-progress .el-progress__text');
            if (progressText) {
                const m = progressText.textContent.match(/(\d+)%/);
                if (m) {
                    const pct = parseInt(m[1], 10);
                    if (!Number.isNaN(pct)) return pct;
                }
            }

            // Fallback: style="width: 73%;"
            const barInner = bigBox.querySelector('.demo-progress .el-progress-bar__inner');
            if (barInner && barInner.getAttribute('style')) {
                const wm = barInner.getAttribute('style').match(/width:\s*([\d.]+)%/i);
                if (wm) {
                    const w = Math.round(parseFloat(wm[1]));
                    if (!Number.isNaN(w)) return w;
                }
            }
        } catch {}
        return null;
    }

    // ─── allgemeine Lade-Erkennung (inkl. Big-Box + Legacy) ─────────────────────
    function isLoading() {
        try {
            if (isBigBoxUpdating()) return true;

            // Legacy: klassisches Lade-Icon
            if (document.querySelector('svg.loading')) return true;

            // Legacy/Fallback: generische Progress-Anzeichen
            const progressText = document.querySelector('.demo-progress .el-progress__text');
            if (progressText) {
                const m = progressText.textContent.match(/(\d+)%/);
                if (m) {
                    const pct = parseInt(m[1], 10);
                    if (!Number.isNaN(pct) && pct >= 0 && pct < 100) return true;
                }
            }
            const barInner = document.querySelector('.demo-progress .el-progress-bar__inner');
            if (barInner && barInner.getAttribute('style')) {
                const wm = barInner.getAttribute('style').match(/width:\s*([\d.]+)%/i);
                if (wm) {
                    const w = parseFloat(wm[1]);
                    if (!Number.isNaN(w) && w >= 0 && w < 100) return true;
                }
            }
        } catch {}
        return false;
    }

    // ─── Statusfarbe inkl. Big-Box-Resultat & Legacy-Fallback ───────────────────
    function getStatusColor() {
        try {
            if (isLoading()) {
                return "#ffa500"; // Orange = aktiv
            }

            // Big-Box: Erfolg/Fehler über Klassen oder Text
            const successBox = document.querySelector('.big-box .upgrade-tip.success');
            const failBox    = document.querySelector('.big-box .upgrade-tip.fail');
            if (successBox) return "#44b979";
            if (failBox)    return "#ff0000";

            const anyTips = Array.from(document.querySelectorAll('.upgrade-type-box .upgrade-tip, .big-box .upgrade-tip'));
            if (anyTips.length) {
                const s = anyTips.map(n => n.textContent.toLowerCase()).join(' | ');
                if (/\berfolg\b|\berfolgreich\b/.test(s)) return "#44b979";
                if (/\bfehl\b|\bgescheitert\b|\bfehlgeschlagen\b/.test(s)) return "#ff0000";
            }

            // Legacy-Fallback über Icon/Farbe
            const legacyRows = Array.from(document.querySelectorAll('.upgrade-steps .el-row.is-align-top')).reverse();
            for (const row of legacyRows) {
                const label = row.querySelector('.label span');
                if (!label) continue;
                const txt = label.textContent.toLowerCase();
                if (!["gescheitert","ergebnis","erfolg","fehlgeschlagen"].some(w=>txt.includes(w))) continue;

                const use = row.querySelector('svg use');
                if (use) {
                    const href = (use.getAttribute('xlink:href') || use.getAttribute('href') || "");
                    if (href.includes("cuowutixing"))   return "#ff0000";
                    if (href.includes("chenggongtishi")) return "#44b979";
                }

                const c = getComputedStyle(label).color;
                if (c && c.startsWith("rgb")) return rgbToHex(c);
            }
        } catch {}

        return "#404040"; // neutral/unbestimmt
    }

    // ─── Desktop-Notification nur bei Erfolg/Fehler; Klick fokussiert Tab ──────
    function notify(statusText, serial) {
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        if (statusText === lastStatusText) return;  // vermeidet Doppelmeldungen
        if (statusText !== "Erfolg" && statusText !== "Gescheitert") return;

        try {
            const n = new Notification(`Status: ${statusText}`, {
                body: `Gerät: ${serial}`,
                tag: `sofarsolar-${serial}-${statusText}`, // ersetzt gleiche Meldungen
                // requireInteraction: true, // optional: anlassen bis Klick
            });

            n.onclick = () => {
                try {
                    // Diesen Tab/Window in den Vordergrund holen
                    window.focus();
                    // Zur Big-Box scrollen (falls vorhanden)
                    const bigBox = document.querySelector('.big-box');
                    if (bigBox) bigBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    n.close();
                } catch {}
            };
        } catch {}

        lastStatusText = statusText;
    }

    // ─── Haupt-Update ───────────────────────────────────────────────────────────
    function update() {
        const serial = getSerialNumber();
        const color  = getStatusColor();
        const text   = colorToText(color);

        // Lade-Animation im Titel
        if (isLoading()) {
            const frame = spinnerFrames[spinnerIndex % spinnerFrames.length];

            // NUR bei neuer Big-Box-UI Prozent anzeigen
            if (isBigBoxUpdating()) {
                const pct = getBigBoxProgress();
                if (pct !== null) {
                    document.title = `${frame} ${pct}% ${serial}`;
                } else {
                    document.title = `${frame} ${serial}`;
                }
            } else {
                // Legacy/sonstige Ladezustände → ohne Prozent
                document.title = `${frame} ${serial}`;
            }

            spinnerIndex++;
            return;
        }

        // Statischer Status: Emoji + Seriennummer
        const emoji = colorToEmoji(color);
        const title = `${emoji} ${serial}`;
        if (title !== lastStaticTitle) {
            document.title = title;
            lastStaticTitle = title;
        }
        notify(text, serial);
    }

    // ─── Ticker ─────────────────────────────────────────────────────────────────
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            lastStaticTitle = "";
            lastStatusText  = "";
            spinnerIndex    = 0;
        }
        if (document.readyState === "complete") update();
    }, intervalMs);

})();
