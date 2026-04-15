/**
 * original author:
 * - github.com/adjisoft
 * - adjisoft.me
 * - t.me/xigma98
 */

const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");

const penyedia = "https://cekresi.com/";
const penyedia2 = "https://apa2.cekresi.com/cekresi/resi/initialize.php";
const tokenBmkg = "21d566d6a0a66cb084fcc3dbbd20fffe";
const timerKey = Buffer.from("79540e250fdb16afac03e19c46dbdeb3", "hex");
const timerIv = Buffer.from("eb2bb9425e81ffa942522e4414e95bd0", "hex");

function pakeGae(args) {
  let noresi = "";
  let exp = "";
  let jsonMode = false;
  let bantuan = false;

  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    if (arg === "--help" || arg === "-h") {
      bantuan = true;
    } else if (arg === "--json") {
      jsonMode = true;
    } else if (arg === "--exp" || arg === "-e") {
      let value = args[i + 1];
      if (!value) {
        throw new Error("Heh, --exp e isine kon ra ono, isine cuk!");
      }
      exp = value;
      i++;
    } else if (arg.startsWith("--exp=")) {
      exp = arg.split("=")[1];
    } else if (!noresi) {
      noresi = arg;
    } else {
      throw new Error(`Argumen ${arg} iku ra dikenal, piye sih!`);
    }
  }
  
  return { noresi, exp, jsonMode, bantuan };
}

function resiBeres(noresi) {
  return String(noresi || "").trim().toUpperCase().replace(/\s+/g, "");
}

function teksResik(teks) {
  return String(teks || "").replace(/\s+/g, " ").trim();
}

function gaweTimerToken(noresi) {
  let cipher = crypto.createCipheriv("aes-128-cbc", timerKey, timerIv);
  let enc = cipher.update(noresi, "utf8", "base64");
  enc += cipher.final("base64");
  return enc;
}

function gaweAxios() {
  return axios.create({
    timeout: 30000,
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      "Accept": "*/*"
    },
    responseType: "text",
    transitional: { forcedJSONParsing: false, silentJSONParsing: false },
    validateStatus: () => true
  });
}

async function golekToken(axiosku) {
  let respon = await axiosku.get(penyedia);
  if (respon.status >= 400) {
    throw new Error(`Gagal mbukak ${penyedia} (HTTP ${respon.status}), error njir!`);
  }
  
  let $ = cheerio.load(respon.data);
  let viewstate = $("#viewstate").attr("value");
  let secretKey = $("#secret_key").attr("value");
  
  if (!viewstate || !secretKey) {
    throw new Error("Token halaman ra ono, jancok!");
  }
  
  return { viewstate, secretKey };
}

async function kirimkan(axiosku, payload) {
  let url = `${penyedia2}?ui=${tokenBmkg}&p=1&w=${Math.random().toString(36).slice(2)}`;
  let body = new URLSearchParams(payload).toString();
  
  let respon = await axiosku.post(url, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Origin": "https://cekresi.com",
      "Referer": "https://cekresi.com/"
    }
  });
  
  if (typeof respon.data === "string") return respon.data;
  if (respon.data && typeof respon.data === "object") return JSON.stringify(respon.data);
  return "";
}

function galiKurir(contentHtml) {
  let $ = cheerio.load(contentHtml);
  let ketemu = new Set();
  let pilihan = [];
  
  $("a[onclick*='setExp']").each((_, el) => {
    let onClick = $(el).attr("onclick") || "";
    let cocok = onClick.match(/setExp\('([^']+)'\)/i);
    if (!cocok) return;
    
    let kode = cocok[1].toUpperCase();
    if (ketemu.has(kode)) return;
    ketemu.add(kode);
    
    pilihan.push({ kode, jeneng: teksResik($(el).text()) || kode });
  });
  
  return pilihan;
}

function ikiTracking(html) {
  let $ = cheerio.load(html);
  return $("#status_resi").length > 0 || $("#accordion").length > 0;
}

function jupukError(html) {
  let $ = cheerio.load(`<div id="root">${html}</div>`);
  let teks = teksResik($("#root").text());
  if (!teks) return "Respon kosong, opo iki?";
  return teks.slice(0, 280);
}

function opoIki(html, noresi, expTried) {
  let $ = cheerio.load(html);
  
  let infoKirim = {};
  $("table tr").each((_, row) => {
    let tds = $(row).find("td").map((__, td) => teksResik($(td).text())).get();
    if (tds.length >= 3 && tds[1] === ":") {
      infoKirim[tds[0]] = tds[2];
    }
  });
  
  let riwayat = [];
  $("table").each((_, table) => {
    let ths = $(table).find("th").map((__, th) => teksResik($(th).text())).get();
    if (ths.length >= 2 && ths[0] === "Tanggal" && ths[1] === "Keterangan") {
      $(table).find("tr").slice(1).each((__, row) => {
        let cols = $(row).find("td").map((___, td) => teksResik($(td).text())).get();
        if (cols.length >= 2) {
          riwayat.push({ tanggal: cols[0], keterangan: cols[1] });
        }
      });
    }
  });
  
  let kurir = teksResik($("#nama_expedisi").first().text()) || 
              teksResik($(".top_title").first().text()).replace(/^Expedisi\s+/i, "") || 
              expTried;
  
  let status = teksResik($("#status_resi").first().text()) || teksResik(infoKirim.Status || "");
  
  return {
    waktu_akses: new Date().toISOString(),
    no_resi: noresi,
    ekspedisi: kurir,
    status_pengiriman: status,
    lokasi_terkini: teksResik($("#last_position").first().text()),
    tautan_pelacakan: $("#linkcekresi").attr("value") || "",
    informasi_pengiriman: infoKirim,
    riwayat_pengiriman: riwayat
};
}

function cetakGaul(result) {
  console.log(`Resi        : ${result.resiMu}`);
  console.log(`Kurir       : ${result.kurirMu || "-"}`);
  console.log(`Status      : ${result.statusMu || "-"}`);
  console.log(`Posisi      : ${result.posisiMu || "-"}`);
  console.log(`Link        : ${result.linkCek || "-"}`);
  
  let info = result.infoKiriman || {};
  let infoKeys = Object.keys(info);
  if (infoKeys.length > 0) {
    console.log("\nInfo Kiriman:");
    for (let key of infoKeys) {
      console.log(`- ${key}: ${info[key] || "-"}`);
    }
  }
  
  console.log("\nRiwayat:");
  if (!result.riwayatMu || result.riwayatMu.length === 0) {
    console.log("- ra ono riwayat, piye toh?");
    return;
  }
  
  for (let item of result.riwayatMu) {
    console.log(`- ${item.tanggal} | ${item.keterangan}`);
  }
}

async function golekResi(axiosku, tokens, noresi, timers, expEksplisit) {
  let expKode = expEksplisit ? expEksplisit.toUpperCase() : "";
  
  if (expKode) {
    let html = await kirimkan(axiosku, {
      viewstate: tokens.viewstate,
      secret_key: tokens.secretKey,
      e: expKode,
      noresi: noresi,
      timers: timers
    });
    
    if (!ikiTracking(html)) {
      throw new Error(`Gagal cek resi kanggo ${expKode}. ${jupukError(html)}`);
    }
    return opoIki(html, noresi, expKode);
  }
  
  let pertama = await kirimkan(axiosku, {
    viewstate: tokens.viewstate,
    secret_key: tokens.secretKey,
    e: "",
    noresi: noresi,
    timers: timers
  });
  
  if (ikiTracking(pertama)) {
    return opoIki(pertama, noresi, "");
  }
  
  let pilihan = [];
  try {
    let parsed = JSON.parse(pertama);
    if (parsed && parsed.content) {
      pilihan = galiKurir(parsed.content);
    }
  } catch (_) {
    throw new Error(`Gagal proses response awal. ${jupukError(pertama)}`);
  }
  
  if (!pilihan.length) {
    throw new Error("Kurir ra ketemu otomatis, coba pake --exp KODE, lur!");
  }
  
  let cocokAwal = pilihan.find(opt => noresi.startsWith(opt.kode));
  let urutan = cocokAwal ? [cocokAwal, ...pilihan.filter(opt => opt.kode !== cocokAwal.kode)] : pilihan;
  
  for (let opt of urutan) {
    let html = await kirimkan(axiosku, {
      viewstate: tokens.viewstate,
      secret_key: tokens.secretKey,
      e: opt.kode,
      noresi: noresi,
      timers: timers
    });
    
    if (ikiTracking(html)) {
      return opoIki(html, noresi, opt.kode);
    }
  }
  
  let kodePilihan = pilihan.map(opt => opt.kode).join(", ");
  throw new Error(`Kabeh kurir gagal, coba --exp salah siji lur: ${kodePilihan}`);
}

async function main() {
  let args = process.argv.slice(2);
  let { noresi, exp, jsonMode, bantuan } = pakeGae(args);
  
  if (bantuan || !noresi) {
    console.log(`Cara pakenya:
  node cekresi.js <NO_RESI> [--exp KODE EKSPEDISI] [--json]

Conto:
  node cekresi.js SPXID0XXXXXXXXXXX --exp SPX
  node cekresi.js SPXID0XXXXXXXXXXX --json

Opsi:
  --exp, -e   Kode ekspedisi (SPX, JNE, JNT, POS)
  --json      Output JSON
  --help, -h  Bantuan`);
    process.exit(bantuan ? 0 : 1);
  }
  
  let resiBener = resiBeres(noresi);
  if (resiBener.length < 4) {
    throw new Error("Resi ra valid, cek maning lur!");
  }
  
  let axiosku = gaweAxios();
  let tokens = await golekToken(axiosku);
  let timers = gaweTimerToken(resiBener);
  let result = await golekResi(axiosku, tokens, resiBener, timers, exp);
  
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  cetakGaul(result);
}

main().catch(err => {
  console.error(`eror lur: ${err.message}`);
  process.exit(1);
});