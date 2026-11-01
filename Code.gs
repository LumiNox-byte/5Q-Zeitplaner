/**
 ============================================================================
 5Q-ZEITENPLANER & DASHBOARD GESAMTSKRIPT
 VERSION: 2.0 - 2 Zeit-Slots pro Spieler + Überschneidungs-Dashboard
 ============================================================================
 */

// ============================================================================
// TEIL 1: WEB-APP API (Für die Anbindung der Webseite)
// ============================================================================

/**
 * Hilfsfunktion: Zeitwert aus Zelle lesen und als sauberes { time: "HH:mm", vielleicht: boolean } zurückgeben.
 */
function readTime(val) {
  if (!val && val !== 0) return { time: "", vielleicht: false };
  var istVielleicht = false;
  var s = "";

  if (val instanceof Date) {
    try {
      s = Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
    } catch (e) {
      var h = val.getHours();
      var m = val.getMinutes();
      s = (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
    }
  } else {
    s = val.toString().trim();
    if (s.toLowerCase() === "xx:xx" || s.toLowerCase() === "xx.xx") {
      return { time: "xx:xx", vielleicht: false };
    }
    if (s.toLowerCase().indexOf("(vb)") !== -1 || s.indexOf("?") !== -1 || s.toLowerCase().indexOf("vielleicht") !== -1) {
      istVielleicht = true;
      s = s.replace(/\(vb\)/gi, "").replace(/\?/g, "").replace(/vielleicht/gi, "").trim();
    }
    if (/^\d{1,2}\.\d{2}$/.test(s)) {
      var p = s.split(".");
      s = (p[0].length < 2 ? "0" + p[0] : p[0]) + ":" + p[1];
    } else if (!isNaN(s) && s !== "") {
      var frac = parseFloat(s);
      var totalMin = Math.round(frac * 24 * 60);
      var hh = Math.floor(totalMin / 60);
      var mm = totalMin % 60;
      s = (hh < 10 ? "0" + hh : hh) + ":" + (mm < 10 ? "0" + mm : mm);
    }
  }

  return { time: s, vielleicht: istVielleicht };
}

function doGet(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === ZEITPLAN-DATEN LADEN (2 Zeilen pro Spieler) ===
    var sheetZeitplan = ss.getSheetByName("Zeitplaner");
    var dataZeitplan = [];

    if (sheetZeitplan) {
      // Ab Zeile 9 starten (Zeile 8 = Header, ab 9 = Spielerdaten)
      var lastRow = sheetZeitplan.getLastRow();
      if (lastRow >= 9) {
        var numRows = lastRow - 8;
        var rawData = sheetZeitplan.getRange(9, 1, numRows, 20).getValues();

        // Spieler immer in 2er-Schritten lesen (Zeile 1 = Slot A, Zeile 2 = Slot B)
        for (var i = 0; i < rawData.length; i += 2) {
          var row1 = rawData[i];
          var row2 = (i + 1 < rawData.length) ? rawData[i + 1] : null;

          var realName = (row1[0] || "").toString().trim();
          var dcName   = (row1[1] || "").toString().trim();

          // Leere Zeilen und Sonderzeilen überspringen
          if (!realName && !dcName) continue;
          var lowerName = realName.toLowerCase();
          if (lowerName.includes("mögliche 5q") || lowerName.includes("teil-überschneidungen") ||
              lowerName.includes("spieler suchen") || lowerName.includes("lanewichtung")) continue;

          var zeiten = {};
          var tage = ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"];
          var cols  = [2, 4, 6, 8, 10, 12, 14]; // Von-Spalte (0-basiert)

          for (var d = 0; d < tage.length; d++) {
            var col = cols[d];
            var s1v = readTime(row1[col]);
            var s1b = readTime(row1[col + 1]);
            var s2v = row2 ? readTime(row2[col])     : { time: "", vielleicht: false };
            var s2b = row2 ? readTime(row2[col + 1]) : { time: "", vielleicht: false };

            var s1Vielleicht = s1v.vielleicht || s1b.vielleicht;
            var s2Vielleicht = s2v.vielleicht || s2b.vielleicht;

            zeiten[tage[d]] = {
              von: s1v.time,
              bis: s1b.time,
              vielleicht: s1Vielleicht,
              slot1: { von: s1v.time, bis: s1b.time, vielleicht: s1Vielleicht },
              slot2: { von: s2v.time, bis: s2b.time, vielleicht: s2Vielleicht }
            };
          }

          dataZeitplan.push({
            realName: realName,
            dcName: dcName,
            zeiten: zeiten,
            aktualisiertAm: (row1[16] || "").toString().trim(),
            aufstellung: (row1[18] || "").toString().trim()   // Spalte S (Index 18)
          });
        }
      }
    }

    // === WOCHENTAGS-DATEN (DATUM PRO TAG) AUS DEM SHEET LESEN ===
    // Im Zeitplaner stehen die Datumsangaben in Zeile 2 (Index 1)
    // Spalten: C (2) = Montag, E (4) = Dienstag, G (6) = Mittwoch, I (8) = Donnerstag,
    //          K (10) = Freitag, M (12) = Samstag, O (14) = Sonntag
    var tageDatum = {};
    var tageLabelsMitDatum = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    var tageKeys = ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"];
    var tageCols = [2, 4, 6, 8, 10, 12, 14];

    if (sheetZeitplan) {
      try {
        var headerCheckRange = sheetZeitplan.getRange(1, 1, Math.min(6, sheetZeitplan.getLastRow()), 18).getValues();
        var headerCheckDisplay = sheetZeitplan.getRange(1, 1, Math.min(6, sheetZeitplan.getLastRow()), 18).getDisplayValues();

        for (var tIdx = 0; tIdx < tageKeys.length; tIdx++) {
          var cIdx = tageCols[tIdx];
          var foundDate = "";

          // Spezifisch Zeile 2 (Index 1) prüfen, dann Zeilen 0 bis 3
          var rowsToCheck = [1, 0, 2, 3];
          for (var ri = 0; ri < rowsToCheck.length; ri++) {
            var rI = rowsToCheck[ri];
            if (rI >= headerCheckRange.length) continue;

            for (var subC = 0; subC <= 1; subC++) {
              var col = cIdx + subC;
              var rawCell = headerCheckRange[rI][col];
              var dispCell = (headerCheckDisplay[rI][col] || "").toString().trim();

              if (rawCell instanceof Date) {
                foundDate = Utilities.formatDate(rawCell, Session.getScriptTimeZone(), "dd.MM.");
                break;
              } else if (dispCell) {
                var dMatch = dispCell.match(/(\d{1,2}\.\d{1,2}\.?(\d{2,4})?)/);
                if (dMatch) {
                  var pDate = dMatch[1];
                  // Falls z.B. "19.10.2026" -> als "19.10." formatieren
                  var parts = pDate.split(".");
                  if (parts.length >= 2) {
                    foundDate = parts[0].padStart(2, "0") + "." + parts[1].padStart(2, "0") + ".";
                  } else {
                    foundDate = pDate;
                  }
                  break;
                }
              }
            }
            if (foundDate) break;
          }

          tageDatum[tageKeys[tIdx]] = foundDate;
          var baseLabel = tageLabelsMitDatum[tIdx];
          tageLabelsMitDatum[tIdx] = foundDate ? baseLabel + " (" + foundDate + ")" : baseLabel;
        }
      } catch (errDate) {
        // Fallback
      }

      // Falls Datumsangaben im Sheet leer waren, dynamisch nach Sheet-Regel berechnen
      var hasAnyDate = false;
      for (var dk in tageDatum) { if (tageDatum[dk]) { hasAnyDate = true; break; } }
      if (!hasAnyDate) {
        var now = new Date();
        var currentJsDay = now.getDay();
        var currentDayOfWeek = currentJsDay === 0 ? 7 : currentJsDay;
        var tagDefs = [
          { key: "montag", dayNum: 1 }, { key: "dienstag", dayNum: 2 },
          { key: "mittwoch", dayNum: 3 }, { key: "donnerstag", dayNum: 4 },
          { key: "freitag", dayNum: 5 }, { key: "samstag", dayNum: 6 }, { key: "sonntag", dayNum: 7 }
        ];
        for (var tdI = 0; tdI < tagDefs.length; tdI++) {
          var tDef = tagDefs[tdI];
          var diff = tDef.dayNum - currentDayOfWeek;
          if (diff < 0) diff += 7;
          var tDate = new Date(now.getTime() + diff * 86400000);
          var dStr = Utilities.formatDate(tDate, Session.getScriptTimeZone() || "Europe/Berlin", "dd.MM.");
          tageDatum[tDef.key] = dStr;
          tageLabelsMitDatum[tdI] = tageLabelsMitDatum[tdI].replace(/\s*\(.*\)/, "") + " (" + dStr + ")";
        }
      }
    }

    // === ÜBERSCHNEIDUNGS-DATEN LESEN ===
    // Im Sheet stehen die Überschneidungen pro Tag in separaten Spalten:
    // Spalten C+D = Montag (Index 2+3), E+F = Dienstag, G+H = Mittwoch,
    // I+J = Donnerstag, K+L = Freitag, M+N = Samstag, O+P = Sonntag (Index 14+15)
    // Jede Zeile für "Mögliche 5Q-Time" und "Teil-Überschneidungen" hat merged Zellen pro Tag.
    var ueberschneidungen = {};
    if (sheetZeitplan) {
      var allData = sheetZeitplan.getDataRange().getDisplayValues();

      for (var r = 0; r < allData.length; r++) {
        var cell0 = (allData[r][0] || "").toString().trim();

        if (cell0 === "Mögliche 5Q-Time" || cell0 === "Teil-Überschneidungen") {
          var combinedBlocks = [];
          for (var ti = 0; ti < tageLabelsMitDatum.length; ti++) {
            // Der Zelleninhalt steht im merged-Block beginnend bei tageCols[ti]
            var tagWert = "";
            for (var ci = tageCols[ti]; ci < tageCols[ti] + 2; ci++) {
              var v = (allData[r][ci] || "").toString().trim();
              if (v && v !== "Keine Zeit") { tagWert = v; break; }
            }
            if (tagWert && tagWert !== "Keine Zeit") {
              // Zeilenumbrüche (<br> aus HTML-Export) normalisieren
              tagWert = tagWert.replace(/<br\s*\/?>/gi, "\n").replace(/\n\n+/g, "\n\n");
              combinedBlocks.push("**" + tageLabelsMitDatum[ti] + "**\n" + tagWert);
            }
          }
          var finalText = combinedBlocks.join("\n\n---\n\n");

          if (cell0 === "Mögliche 5Q-Time") {
            ueberschneidungen.fuenfqTime = finalText;
          } else {
            ueberschneidungen.teilUeberschneidungen = finalText;
          }
        }
      }
    }

    // === SPIELERINFOS LADEN ===
    var dataSpielerInfo = [];
    var sheetSpielerInfo = ss.getSheetByName("Spielerinformation");
    if (sheetSpielerInfo) {
      var sData = sheetSpielerInfo.getDataRange().getDisplayValues();
      var sHeaders = ["Roam", "Midlane", "Jungle", "Explane", "Goldlane"];
      var sHeaderRow = -1;

      for (var sr = 0; sr < sData.length; sr++) {
        var rStr = sData[sr].join(" ").toLowerCase();
        if (rStr.indexOf("roam") !== -1 && rStr.indexOf("midlane") !== -1) {
          sHeaderRow = sr;
          break;
        }
      }
      if (sHeaderRow === -1) sHeaderRow = 6;

      var si = sHeaderRow + 1;
      while (si < sData.length) {
        var rName = sData[si][0] ? sData[si][0].toString().trim() : "";
        var dName = sData[si][1] ? sData[si][1].toString().trim() : "";

        if (!rName && !dName) { si++; continue; }
        var rNameLower = rName.toLowerCase();
        if (rNameLower === "real-name" || rNameLower === "name" || rNameLower.includes("spieler suchen") || rNameLower.includes("lanewichtung")) { si++; continue; }

        // Prüfen, ob die nächste Zeile eine Helden-Folgezeile (ohne neuen Namen) ist
        var hasSubRow = (si + 1 < sData.length && !sData[si + 1][0] && !sData[si + 1][1]);
        var subRowIdx = hasSubRow ? (si + 1) : -1;

        var weights = {};
        for (var col = 0; col < 5; col++) {
          var val = parseInt(sData[si][col + 2], 10);
          weights[sHeaders[col]] = isNaN(val) ? 0 : val;
        }

        var heroesByLane = {};
        for (var lIdx = 0; lIdx < 5; lIdx++) {
          heroesByLane[sHeaders[lIdx]] = [];
          var colStart = 8 + (lIdx * 2);

          for (var sub1 = 0; sub1 < 2; sub1++) {
            if (colStart + sub1 < sData[si].length) {
              var h1 = sData[si][colStart + sub1] ? sData[si][colStart + sub1].toString().trim() : "";
              if (h1 && h1 !== "0" && h1 !== "NaN") heroesByLane[sHeaders[lIdx]].push(h1);
            }
          }
          if (subRowIdx !== -1) {
            for (var sub2 = 0; sub2 < 2; sub2++) {
              if (colStart + sub2 < sData[subRowIdx].length) {
                var h2 = sData[subRowIdx][colStart + sub2] ? sData[subRowIdx][colStart + sub2].toString().trim() : "";
                if (h2 && h2 !== "0" && h2 !== "NaN") heroesByLane[sHeaders[lIdx]].push(h2);
              }
            }
          }
        }

        dataSpielerInfo.push({
          realName: rName,
          dcName: dName || rName,
          lanewichtung: weights,
          mainhelden: heroesByLane
        });

        si += (hasSubRow ? 2 : 1);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      zeitplan: dataZeitplan,
      spielerInfo: dataSpielerInfo,
      ueberschneidungen: ueberschneidungen,
      tageDatum: tageDatum
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var requestData;
    if (typeof e.postData.contents === 'string') {
      requestData = JSON.parse(e.postData.contents);
    } else {
      requestData = e.parameter;
    }

    // ========================================================================
    // AKTION 0: SPIELER-IDENTITÄT / NAMEN & AUFSTELLUNG BEARBEITEN
    // ========================================================================
    if (requestData.action === "savePlayerIdentity") {
      var oldReal = (requestData.oldRealName || "").toString().trim();
      var oldDc   = (requestData.oldDcName   || "").toString().trim();
      var newReal = (requestData.newRealName || "").toString().trim();
      var newDc   = (requestData.newDcName   || "").toString().trim();
      var newAufstellung = (requestData.newAufstellung || "").toString().trim(); // z.B. "Mainspieler" oder "Ersatzspieler 1"

      if (!newReal && !newDc) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Name darf nicht leer sein." })).setMimeType(ContentService.MimeType.JSON);
      }

      var sheetZ = ss.getSheetByName("Zeitplaner");
      var sheetI = ss.getSheetByName("Spielerinformation");

      // 1. In Zeitplaner aktualisieren (Spalte A = Real, B = DC, S = Aufstellung)
      if (sheetZ) {
        var lz = sheetZ.getLastRow();
        if (lz >= 9) {
          var zVals = sheetZ.getRange(9, 1, lz - 8, 2).getValues();
          var foundZRow = -1;
          for (var zi = 0; zi < zVals.length; zi++) {
            var zR = (zVals[zi][0] || "").toString().toLowerCase().trim();
            var zD = (zVals[zi][1] || "").toString().toLowerCase().trim();
            if ((oldDc && (zD === oldDc.toLowerCase() || zR === oldDc.toLowerCase())) ||
                (oldReal && (zR === oldReal.toLowerCase() || zD === oldReal.toLowerCase()))) {
              foundZRow = 9 + zi;
              break;
            }
          }
          if (foundZRow !== -1) {
            sheetZ.getRange(foundZRow, 1).setValue(newReal || newDc);
            sheetZ.getRange(foundZRow, 2).setValue(newDc || newReal);
            if (newAufstellung) {
              sheetZ.getRange(foundZRow, 19).setValue(newAufstellung); // Spalte S (Index 19, 1-basiert)
            }
          }
        }
      }

      // 2. In Spielerinformation aktualisieren (Spalte A = Real, B = DC)
      if (sheetI) {
        var li = sheetI.getLastRow();
        if (li >= 8) {
          var iVals = sheetI.getRange(8, 1, li - 7, 2).getValues();
          var foundIRow = -1;
          for (var ii = 0; ii < iVals.length; ii++) {
            var iR = (iVals[ii][0] || "").toString().toLowerCase().trim();
            var iD = (iVals[ii][1] || "").toString().toLowerCase().trim();
            if ((oldDc && (iD === oldDc.toLowerCase() || iR === oldDc.toLowerCase())) ||
                (oldReal && (iR === oldReal.toLowerCase() || iD === oldReal.toLowerCase()))) {
              foundIRow = 8 + ii;
              break;
            }
          }
          if (foundIRow !== -1) {
            sheetI.getRange(foundIRow, 1).setValue(newReal || newDc);
            sheetI.getRange(foundIRow, 2).setValue(newDc || newReal);
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Spieler-Identität erfolgreich aktualisiert."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================================
    // AKTION 1: SPIELERINFORMATIONEN (LANES & HELDEN) SPEICHERN
    // ========================================================================
    if (requestData.action === "saveSpielerInfo") {
      var sheetInfo = ss.getSheetByName("Spielerinformation");
      if (!sheetInfo) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Tabellenblatt 'Spielerinformation' nicht gefunden." })).setMimeType(ContentService.MimeType.JSON);
      }

      var lastRowInfo = sheetInfo.getLastRow();
      if (lastRowInfo < 8) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Keine Spieler in Spielerinformation gefunden." })).setMimeType(ContentService.MimeType.JSON);
      }

      var numRowsInfo = lastRowInfo - 7;
      var rawInfo = sheetInfo.getRange(8, 1, numRowsInfo, 2).getValues();

      var searchDcInfo   = (requestData.dcName || "").toString().toLowerCase().trim();
      var searchRealInfo = (requestData.realName || "").toString().toLowerCase().trim();
      var pRow1 = -1;

      for (var k = 0; k < rawInfo.length; k++) {
        var rN = (rawInfo[k][0] || "").toString().toLowerCase().trim();
        var dN = (rawInfo[k][1] || "").toString().toLowerCase().trim();
        if (!rN && !dN) continue;

        if ((searchDcInfo && (dN === searchDcInfo || rN === searchDcInfo)) ||
            (searchRealInfo && (rN === searchRealInfo || dN === searchRealInfo))) {
          pRow1 = 8 + k;
          break;
        }
      }

      if (pRow1 === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Spieler '" + (requestData.realName || requestData.dcName) + "' in Spielerinformation nicht gefunden."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var pRow2 = pRow1 + 1;
      var lanesList = ["Roam", "Midlane", "Jungle", "Explane", "Goldlane"];
      var laneWeights = requestData.lanewichtung || {};
      var heroesObj   = requestData.mainhelden || {};

      // 1. Lanewichtungen schreiben (Spalten C bis G, Index 3 bis 7)
      for (var li = 0; li < lanesList.length; li++) {
        var lCol = 3 + li;
        var wVal = parseInt(laneWeights[lanesList[li]], 10);
        sheetInfo.getRange(pRow1, lCol).setValue(isNaN(wVal) ? 0 : wVal);
      }

      // 2. Mainhelden schreiben (Spalten 9 bis 18)
      // Zeile 1: Helden 1 und 2 | Zeile 2: Helden 3 und 4
      for (var hi = 0; hi < lanesList.length; hi++) {
        var laneHName = lanesList[hi];
        var hArr = heroesObj[laneHName] || [];
        var colStart = 9 + (hi * 2);

        var h1 = (hArr[0] || "").toString().trim();
        var h2 = (hArr[1] || "").toString().trim();
        var h3 = (hArr[2] || "").toString().trim();
        var h4 = (hArr[3] || "").toString().trim();

        sheetInfo.getRange(pRow1, colStart).setValue(h1);
        sheetInfo.getRange(pRow1, colStart + 1).setValue(h2);
        sheetInfo.getRange(pRow2, colStart).setValue(h3);
        sheetInfo.getRange(pRow2, colStart + 1).setValue(h4);
      }

      // 3. Falls auch Aufstellung mitgegeben wurde, in Zeitplaner aktualisieren
      if (requestData.aufstellung) {
        var sZ = ss.getSheetByName("Zeitplaner");
        if (sZ) {
          var lzR = sZ.getLastRow();
          if (lzR >= 9) {
            var zRData = sZ.getRange(9, 1, lzR - 8, 2).getValues();
            for (var zIdx = 0; zIdx < zRData.length; zIdx++) {
              var zReal = (zRData[zIdx][0] || "").toString().toLowerCase().trim();
              var zDc   = (zRData[zIdx][1] || "").toString().toLowerCase().trim();
              if ((searchDcInfo && (zDc === searchDcInfo || zReal === searchDcInfo)) ||
                  (searchRealInfo && (zReal === searchRealInfo || zDc === searchRealInfo))) {
                sZ.getRange(9 + zIdx, 19).setValue(requestData.aufstellung);
                break;
              }
            }
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Spielerinformationen erfolgreich gespeichert."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================================
    // AKTION 2: SPIELERZEITEN SPEICHERN (STANDARD)
    // ========================================================================
    var sheet = ss.getSheetByName("Zeitplaner");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Tabellenblatt 'Zeitplaner' nicht gefunden." })).setMimeType(ContentService.MimeType.JSON);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 9) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Keine Spieler im Sheet gefunden." })).setMimeType(ContentService.MimeType.JSON);
    }

    var numRows = lastRow - 8;
    var rawData = sheet.getRange(9, 1, numRows, 2).getValues();

    var searchDc   = (requestData.dcName || "").toString().toLowerCase().trim();
    var searchReal = (requestData.realName || "").toString().toLowerCase().trim();
    var row1Index  = -1;

    // Spieler flexibel in den Zeilen suchen
    for (var i = 0; i < rawData.length; i++) {
      var rName = (rawData[i][0] || "").toString().toLowerCase().trim();
      var dName = (rawData[i][1] || "").toString().toLowerCase().trim();
      if (!rName && !dName) continue;

      if ((searchDc && (dName === searchDc || rName === searchDc)) ||
          (searchReal && (rName === searchReal || dName === searchReal))) {
        row1Index = 9 + i;
        break;
      }
    }

    if (row1Index === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Spieler '" + (requestData.realName || requestData.dcName) + "' nicht gefunden."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var row2Index = row1Index + 1; // Zeile für Slot 2

    // Wochentags-Spaltenpaare (Spalte Von / Spalte Bis, 1-basiert)
    var tageSpalten = {
      montag:     { von: 3,  bis: 4  },
      dienstag:   { von: 5,  bis: 6  },
      mittwoch:   { von: 7,  bis: 8  },
      donnerstag: { von: 9,  bis: 10 },
      freitag:    { von: 11, bis: 12 },
      samstag:    { von: 13, bis: 14 },
      sonntag:    { von: 15, bis: 16 }
    };

    var zeiten = requestData.zeiten || {};

    // Hilfsfunktion: Schreibt Zeit sauber oder leert die Zelle (mit optionaler Vielleicht-Markierung)
    function writeTimeCell(row, col, timeStr, istVielleicht) {
      var cell = sheet.getRange(row, col);
      var val = (timeStr || "").toString().trim();
      if (!val) {
        cell.clearContent();
      } else {
        if (val.toLowerCase() === "xx:xx" || val.toLowerCase() === "xx.xx") {
          cell.setValue("xx:xx");
        } else {
          if (istVielleicht && val.toLowerCase().indexOf("(vb)") === -1) {
            val = val + " (vb)";
          }
          cell.setValue(val);
        }
      }
    }

    for (var tag in tageSpalten) {
      if (!zeiten[tag]) continue;
      var sp = tageSpalten[tag];

      var s1 = zeiten[tag].slot1 || (zeiten[tag].von !== undefined ? { von: zeiten[tag].von, bis: zeiten[tag].bis, vielleicht: zeiten[tag].vielleicht } : {});
      var s2 = zeiten[tag].slot2 || {};

      var s1Vb = (s1.vielleicht === true || s1.vielleicht === "true" || zeiten[tag].vielleicht === true);
      var s2Vb = (s2.vielleicht === true || s2.vielleicht === "true");

      writeTimeCell(row1Index, sp.von, s1.von, s1Vb);
      writeTimeCell(row1Index, sp.bis, s1.bis, s1Vb);
      writeTimeCell(row2Index, sp.von, s2.von, s2Vb);
      writeTimeCell(row2Index, sp.bis, s2.bis, s2Vb);
    }

    // Timestamp setzen
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd.MM.yyyy HH:mm");
    sheet.getRange(row1Index, 17).setValue(now);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Zeiten erfolgreich gespeichert."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.JSON);
}


// ============================================================================
// TEIL 2: ORIGINAL GOOGLE SHEETS LOKAL-SKRIPTE (unverändert)
// ============================================================================

/**
 * Custom Function: =SPIELER_INFO(B38)
 */
function SPIELER_INFO(spielerName) {
  if (!spielerName || spielerName.toString().trim() === "") {
    return "Bitte einen Spieler auswählen";
  }

  var searchName = spielerName.toString().trim().toLowerCase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var planSheet = ss.getSheetByName("Zeitplaner");
  if (!planSheet) return "Tabellenblatt 'Zeitplaner' nicht gefunden";

  var playerDetails = getPlayerDetails();
  var matchedKey = null;
  for (var key in playerDetails) {
    if (key.trim().toLowerCase() === searchName) {
      matchedKey = key;
      break;
    }
  }

  var details = matchedKey ? playerDetails[matchedKey] : { weights: {}, heroesByLane: {} };
  var displayName = matchedKey ? matchedKey : spielerName.toString().trim();

  var planData = planSheet.getDataRange().getDisplayValues();

  var scheduleLines = [];
  var days = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  var dayCols = [2, 4, 6, 8, 10, 12, 14];

  for (var r = 0; r < planData.length; r++) {
    var rowName   = planData[r][0] ? planData[r][0].toString().trim() : "";
    var dcNameInRow = planData[r][1] ? planData[r][1].toString().trim() : "";

    if (rowName.toLowerCase() !== searchName && dcNameInRow.toLowerCase() !== searchName) continue;

    var role = planData[r][18] ? planData[r][18].toString().trim() : "Mainspieler";

    for (var d = 0; d < days.length; d++) {
      var c = dayCols[d];
      var t1_von = planData[r][c]     ? planData[r][c].toString().trim()     : "";
      var t1_bis = planData[r][c + 1] ? planData[r][c + 1].toString().trim() : "";

      var t2_von = (r + 1 < planData.length && planData[r+1][c])     ? planData[r+1][c].toString().trim()     : "";
      var t2_bis = (r + 1 < planData.length && planData[r+1][c + 1]) ? planData[r+1][c+1].toString().trim() : "";

      var dayTimeStr = "";
      if (t1_von && t1_bis && t1_von.toLowerCase() !== "xx:xx") dayTimeStr += t1_von + " - " + t1_bis;
      if (t2_von && t2_bis && t2_von.toLowerCase() !== "xx:xx") {
        if (dayTimeStr) dayTimeStr += ", ";
        dayTimeStr += t2_von + " - " + t2_bis;
      }

      if (dayTimeStr) {
        scheduleLines.push("  • " + days[d] + ": " + dayTimeStr + "  (" + role + ")");
      }
    }
  }

  if (scheduleLines.length === 0) {
    scheduleLines.push("  • Keine Verfügbarkeiten im Zeitplaner eingetragen");
  }

  var laneLines = [];
  var maxVal = -1;
  for (var lKey in details.weights) {
    if (details.weights[lKey] > maxVal) maxVal = details.weights[lKey];
  }

  for (var laneKey in details.weights) {
    var val = details.weights[laneKey];
    var valNum = (val !== undefined && val !== "" && !isNaN(val)) ? parseInt(val, 10) : 0;
    var mainTag = (valNum === maxVal && valNum > 0) ? " ⭐ (Main-Lane)" : "";
    laneLines.push("  • " + padRight(laneKey + ":", 10) + " [ " + padLeft(valNum.toString(), 2) + " ]" + mainTag);
  }

  var heroLines = [];
  for (var hLane in details.heroesByLane) {
    var list = details.heroesByLane[hLane];
    if (list && list.length > 0) {
      heroLines.push("  • " + padRight(hLane + ":", 10) + " " + list.join(", "));
    }
  }
  var heroesText = heroLines.length > 0 ? heroLines.join("\n") : "  • Keine Helden eingetragen";

  return "==================================================\n" +
         "👤 SPIELER-STECKBRIEF: " + displayName + "\n" +
         "==================================================\n" +
         "📅 VERFÜGBARE ZEITEN & ROLLEN:\n" +
         scheduleLines.join("\n") + "\n\n" +
         "--------------------------------------------------\n" +
         "🎯 LANE-WICHTUNGEN (0-10):\n" +
         laneLines.join("\n") + "\n\n" +
         "--------------------------------------------------\n" +
         "⚔️ MAIN-HELDEN NACH LANE:\n" +
         heroesText + "\n" +
         "==================================================";
}

function padRight(str, length) {
  var s = (str !== undefined && str !== null) ? String(str) : "";
  while (s.length < length) s += " ";
  return s;
}

function padLeft(str, length) {
  var s = (str !== undefined && str !== null) ? String(str) : "";
  while (s.length < length) s = " " + s;
  return s;
}

function getPlayerDetails() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var infoSheet = ss.getSheetByName("Spielerinformation");
  if (!infoSheet) return {};

  var data = infoSheet.getDataRange().getDisplayValues();
  if (data.length < 2) return {};

  var headerRowIdx = -1;
  var headers = ["Roam", "Midlane", "Jungle", "Explane", "Goldlane"];

  for (var r = 0; r < data.length; r++) {
    var rowStr = data[r].join(" ").toLowerCase();
    if (rowStr.indexOf("roam") !== -1 && rowStr.indexOf("midlane") !== -1) {
      headerRowIdx = r;
      if (data[r].length >= 7) {
        headers = [data[r][2], data[r][3], data[r][4], data[r][5], data[r][6]];
      }
      break;
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 6;

  var playerDetails = {};

  var i = headerRowIdx + 1;
  while (i < data.length) {
    var realName = data[i][0] ? data[i][0].toString().trim() : "";
    var dcName   = data[i][1] ? data[i][1].toString().trim() : "";

    if (!realName && !dcName) { i++; continue; }
    if (realName === "Real-Name" || realName === "Name" || realName.toLowerCase().includes("spieler suchen")) { i++; continue; }
    var hasSubRow = (i + 1 < data.length && !data[i + 1][0] && !data[i + 1][1]);
    var subRowIdx = hasSubRow ? (i + 1) : -1;

    var weights = {};
    for (var col = 0; col < 5; col++) {
      var laneName = headers[col] ? headers[col].toString().trim() : "Lane " + (col + 1);
      var valStr = data[i][col + 2];
      var val = parseInt(valStr, 10);
      weights[laneName] = isNaN(val) ? 0 : val;
    }

    var heroesByLane = {};
    for (var lIdx = 0; lIdx < 5; lIdx++) {
      var lName = headers[lIdx] ? headers[lIdx].toString().trim() : "Lane " + (lIdx + 1);
      heroesByLane[lName] = [];
      var colStart = 8 + (lIdx * 2);

      for (var sub1 = 0; sub1 < 2; sub1++) {
        if (colStart + sub1 < data[i].length) {
          var h1 = data[i][colStart + sub1] ? data[i][colStart + sub1].toString().trim() : "";
          if (h1 && h1 !== "0" && h1 !== "NaN" && h1 !== "") heroesByLane[lName].push(h1);
        }
      }
      if (subRowIdx !== -1) {
        for (var sub2 = 0; sub2 < 2; sub2++) {
          if (colStart + sub2 < data[subRowIdx].length) {
            var h2 = data[subRowIdx][colStart + sub2] ? data[subRowIdx][colStart + sub2].toString().trim() : "";
            if (h2 && h2 !== "0" && h2 !== "NaN" && h2 !== "") heroesByLane[lName].push(h2);
          }
        }
      }
    }

    var detailsObj = { weights: weights, heroesByLane: heroesByLane };
    if (realName) playerDetails[realName] = detailsObj;
    if (dcName)   playerDetails[dcName]   = detailsObj;

    i += (hasSubRow ? 2 : 1);
  }

  return playerDetails;
}

function assignOptimalLanes(players, playerDetails) {
  if (!players || players.length === 0) return { assignment: {}, score: 0 };

  var safePlayers = players.slice();
  while (safePlayers.length < 5) safePlayers.push("Dummy" + (safePlayers.length + 1));

  var lanes = ["Roam", "Midlane", "Jungle", "Explane", "Goldlane"];
  var bestAssignment = null;
  var maxOverallEvaluation = -99999999;
  var bestRawScore = 0;

  function permute(arr) {
    if (arr.length === 0) return [[]];
    var result = [];
    for (var i = 0; i < arr.length; i++) {
      var rest = permute(arr.slice(0, i).concat(arr.slice(i + 1)));
      for (var j = 0; j < rest.length; j++) result.push([arr[i]].concat(rest[j]));
    }
    return result;
  }

  var lanePermutations = permute(lanes);

  for (var p = 0; p < lanePermutations.length; p++) {
    var currentLanes = lanePermutations[p];
    var rawScore = 0;
    var penalty = 0;
    var currentMap = {};

    for (var i = 0; i < 5; i++) {
      var pName = safePlayers[i];
      var assignedLane = currentLanes[i];

      var pDetails = null;
      var pSearch = pName.toLowerCase().trim();
      for (var key in playerDetails) {
        if (key.toLowerCase().trim() === pSearch) { pDetails = playerDetails[key]; break; }
      }

      var weights = pDetails ? pDetails.weights : { Roam: 0, Midlane: 0, Jungle: 0, Explane: 0, Goldlane: 0 };
      var primaryWeight = weights[assignedLane] !== undefined ? weights[assignedLane] : 0;

      var playerBestWeight = 0;
      for (var l in weights) { if (weights[l] > playerBestWeight) playerBestWeight = weights[l]; }

      rawScore += primaryWeight;
      var diff = playerBestWeight - primaryWeight;
      if (playerBestWeight === 10)       penalty += diff * diff * 100000;
      else if (playerBestWeight >= 8)    penalty += diff * diff * 10000;
      else                               penalty += diff * diff * 100;

      currentMap[pName] = assignedLane;
    }

    var evaluation = (rawScore * 10000) - penalty;
    if (evaluation > maxOverallEvaluation) {
      maxOverallEvaluation = evaluation;
      bestRawScore = rawScore;
      bestAssignment = currentMap;
    }
  }

  var finalAssignment = {};
  for (var k = 0; k < players.length; k++) {
    finalAssignment[players[k]] = bestAssignment[players[k]] || "Flex";
  }

  return { assignment: finalAssignment, score: bestRawScore };
}

function BERECHNE_UEBERSCHNEIDUNGEN(namesRange, timesRange, rolesRange, minPlayers, maxPlayers) {
  if (!timesRange || !namesRange) return "Keine Zeit";

  if (typeof rolesRange === "number") {
    maxPlayers = minPlayers;
    minPlayers = rolesRange;
    rolesRange = null;
  }

  var playerDetails = getPlayerDetails();

  var slots = new Array(1440);
  for (var i = 0; i < 1440; i++) slots[i] = [];

  var numRows = timesRange.length;

  for (var r = 0; r < numRows; r += 2) {
    var name = namesRange[r][0];
    if (!name || name.toString().trim() === "") continue;

    var cleanName = name.toString().trim();
    var roleStr = (rolesRange && rolesRange[r] && rolesRange[r][0]) ? rolesRange[r][0].toString().trim().toLowerCase() : "mainspieler";
    var priority = 1;

    if      (roleStr.indexOf("ersatzspieler 1") !== -1 || roleStr === "ersatz 1") priority = 2;
    else if (roleStr.indexOf("ersatzspieler 2") !== -1 || roleStr === "ersatz 2") priority = 3;
    else if (roleStr.indexOf("ersatzspieler 3") !== -1 || roleStr === "ersatz 3") priority = 4;
    else if (roleStr.indexOf("ersatzspieler 4") !== -1 || roleStr === "ersatz 4") priority = 5;
    else if (roleStr.indexOf("ersatzspieler 5") !== -1 || roleStr === "ersatz 5") priority = 6;
    else if (roleStr.indexOf("ersatz") !== -1)                                    priority = 7;

    for (var subRow = 0; subRow < 2; subRow++) {
      if (r + subRow >= numRows) break;
      var vonVal = timesRange[r + subRow][0];
      var bisVal = timesRange[r + subRow][1];

      if (vonVal !== "" && bisVal !== "" && vonVal !== undefined && bisVal !== undefined) {
        var isVb = (vonVal.toString().toLowerCase().indexOf("(vb)") !== -1 || bisVal.toString().toLowerCase().indexOf("(vb)") !== -1);
        var startMin = parseTimeToMinutes(vonVal);
        var endMin   = parseTimeToMinutes(bisVal);

        if (startMin !== null && endMin !== null && startMin < endMin) {
          var pDisplayName = cleanName + (isVb ? " (vb)" : "");
          for (var m = startMin; m < endMin; m++) {
            var exists = slots[m].some(function(p) { return p.name.toLowerCase() === cleanName.toLowerCase(); });
            if (!exists) slots[m].push({ name: cleanName, displayName: pDisplayName, isVb: isVb, priority: priority + (isVb ? 0.5 : 0) });
          }
        }
      }
    }
  }

  var blocks = [];
  var currentBlock = null;

  for (var m = 0; m < 1440; m++) {
    var availablePlayers = slots[m];
    availablePlayers.sort(function(a, b) {
      return a.priority !== b.priority ? a.priority - b.priority : a.name.localeCompare(b.name);
    });

    var count = availablePlayers.length;
    var matches = (count >= minPlayers) && (maxPlayers === undefined || count <= maxPlayers);

    if (matches) {
      var limit = (minPlayers >= 5) ? 5 : count;
      var chosen = availablePlayers.slice(0, limit);
      var displayStr = "";

      if (limit === 5) {
        var rawPlayerNames = chosen.map(function(p) { return p.name; });
        var opt = assignOptimalLanes(rawPlayerNames, playerDetails);
        var formatted = chosen.map(function(p) {
          var lane = opt.assignment[p.name] || "Flex";
          return p.name + (p.isVb ? " (vb)" : "") + " (" + lane + ")";
        });
        displayStr = formatted.join(", ");
      } else {
        displayStr = chosen.map(function(p) { return p.displayName || p.name; }).join(", ");
      }

      if (!currentBlock) {
        currentBlock = { start: m, end: m + 1, players: displayStr };
      } else if (currentBlock.players === displayStr) {
        currentBlock.end = m + 1;
      } else {
        blocks.push(currentBlock);
        currentBlock = { start: m, end: m + 1, players: displayStr };
      }
    } else {
      if (currentBlock) { blocks.push(currentBlock); currentBlock = null; }
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  if (blocks.length === 0) return "Keine Zeit";

  return blocks.map(function(b) {
    return formatMinutes(b.start) + " - " + formatMinutes(b.end) + " (" + b.players + ")";
  }).join("\n\n");
}

function parseTimeToMinutes(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.getHours() * 60 + val.getMinutes();
  var str = val.toString().trim();
  if (!str) return null;
  str = str.replace(/\(vb\)/gi, "").replace(/\?/g, "").replace(".", ":").trim();
  var parts = str.split(":");
  if (parts.length < 2) return null;
  var hrs  = parseInt(parts[0], 10);
  var mins = parseInt(parts[1], 10);
  if (isNaN(hrs) || isNaN(mins)) return null;
  return hrs * 60 + mins;
}

function formatMinutes(m) {
  var hrs  = Math.floor(m / 60);
  var mins = m % 60;
  return (hrs  < 10 ? "0" + hrs  : hrs)  + ":" +
         (mins < 10 ? "0" + mins : mins);
}

function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.source.getActiveSheet();
  if (sheet.getName().trim() !== "Zeitplaner") return;

  var range = e.range;
  var row   = range.getRow();
  var col   = range.getColumn();

  if (row >= 9 && row <= 28) {
    var timestampCol = 17;
    var now = new Date();
    var formattedDate = Utilities.formatDate(now, "Europe/Berlin", "dd.MM.yyyy HH:mm");

    var targetRow = row;
    var nameInRow = sheet.getRange(row, 1).getValue();
    if ((!nameInRow || nameInRow.toString().trim() === "") && row > 9) {
      targetRow = row - 1;
    }

    if (col === timestampCol) {
      sheet.getRange(targetRow, timestampCol).setValue(formattedDate);
      return;
    }

    if (col >= 1 && col <= 20 && col !== timestampCol) {
      sheet.getRange(targetRow, timestampCol).setValue(formattedDate);
    }
  }
}

function loescheVergangeneZeiten() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var planSheet = ss.getSheetByName("Zeitplaner");
  if (!planSheet) return;

  var now = new Date();
  var currentDayIndex = now.getDay();
  var todayIdx    = (currentDayIndex === 0) ? 6 : currentDayIndex - 1;
  var targetDayIdx = (todayIdx + 6) % 7;

  var dayColPairs = [
    { von: 3,  bis: 4  },
    { von: 5,  bis: 6  },
    { von: 7,  bis: 8  },
    { von: 9,  bis: 10 },
    { von: 11, bis: 12 },
    { von: 13, bis: 14 },
    { von: 15, bis: 16 }
  ];

  var colPair = dayColPairs[targetDayIdx];
  planSheet.getRange(9, colPair.von, 20, 1).clearContent();
  planSheet.getRange(9, colPair.bis, 20, 1).clearContent();
}
