// ==UserScript==
// @name         Emoji + Seriennummer + animierter Spinner (ohne Prefix) + Benachrichtigung
// @namespace    http://tampermonkey.net/
// @version      5.4
// @description  Zeigt im Tabtitel bei Ladevorgängen nur den Spinner (⠋⠙…) vor der Seriennummer, sonst 🟢/🔴 + Seriennummer. Benachrichtigt nur bei Erfolg oder Fehler. Favicon bleibt unverändert. Animation läuft auch im Hintergrund. Intervall: 1000 ms.
// @match        *://eu.sofarcloud.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ─── KONFIGURATION ───────────────────────────────────────────────────────────
    const spinnerFrames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
    const intervalMs = 250; // Script läuft alle 1000 ms (1 Sekunde)
    // ────────────────────────────────────────────────────────────────────────────────

    let lastStaticTitle = "";
    let lastUrl = location.href;
    let lastStatusText = "";
    let spinnerIndex = 0;

    // Desktop-Notifications erlauben
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    function getSerialNumber() {
        const m = location.href.match(/deviceDetail\/([^?]+)/);
        return m ? m[1] : "SofarCloud";
    }

    function rgbToHex(rgb) {
        const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!m) return "#404040";
        return "#" + [m[1],m[2],m[3]].map(x=>(+x).toString(16).padStart(2,'0')).join('');
    }

    function colorToEmoji(hex) {
        hex = hex.toLowerCase();
        if (hex === "#44b979") return "🟢";
        if (["#ff0000","#ee4d4d","#ef4d4d"].includes(hex)) return "🔴";
        return "";
    }

    function colorToText(hex) {
        hex = hex.toLowerCase();
        if (hex === "#44b979") return "Erfolg";
        if (["#ff0000","#ee4d4d","#ef4d4d"].includes(hex)) return "Gescheitert";
        return "Kein Ergebnis";
    }

    function isLoading() {
        return !!document.querySelector('svg.loading');
    }

    function getStatusColor() {
        if (isLoading()) {
            return "#ffa500"; // Ladezustand, dient nur intern
        }
        const rows = Array.from(document.querySelectorAll('.upgrade-steps .el-row.is-align-top')).reverse();
        for (const row of rows) {
            const label = row.querySelector('.label span');
            if (!label) continue;
            const text = label.textContent.toLowerCase();
            if (!["gescheitert","ergebnis","erfolg","fehlgeschlagen"].some(w=>text.includes(w))) continue;
            const use = row.querySelector('svg use');
            if (use) {
                const href = use.getAttribute('xlink:href') || use.getAttribute('href');
                if (href.includes("cuowutixing")) return "#ff0000";
                if (href.includes("chenggongtishi")) return "#44b979";
            }
            const c = getComputedStyle(label).color;
            if (c.startsWith("rgb")) return rgbToHex(c);
        }
        return "#404040";
    }

    function notify(statusText, serial) {
        if (Notification.permission !== "granted") return;
        if (statusText === lastStatusText) return;
        if (statusText !== "Erfolg" && statusText !== "Gescheitert") return;
        new Notification(`Status: ${statusText}`, { body: `Gerät: ${serial}` });
        lastStatusText = statusText;
    }

    function update() {
        const serial = getSerialNumber();
        const color = getStatusColor();
        const text = colorToText(color);

        // Lade-Animation im Titel: nur der Frame + Seriennummer
        if (isLoading()) {
            const frame = spinnerFrames[spinnerIndex % spinnerFrames.length];
            document.title = `${frame} ${serial}`;
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

    // Intervall: update() wird alle intervalMs ausgeführt
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            lastStaticTitle= "";
            lastStatusText = "";
            spinnerIndex = 0;
        }
        if (document.readyState === "complete") update();
    }, intervalMs);

})();
