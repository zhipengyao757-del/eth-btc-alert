import fs from "fs";

const SYMBOLS = ["ETHUSDT", "BTCUSDT"];
const INTERVAL = "1m";

const PERIODS = {
  "4h": 240,
  "12h": 720,
  "24h": 1440,
};

const THRESHOLD = 0.02;

// 你的 telegram
const BOT_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;

async function fetchKlines(symbol, limit = 1500) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${INTERVAL}&limit=${limit}`;
  const res = await fetch(url);
  return await res.json();
}

function calcReturn(klines, minutes) {
  if (klines.length < minutes + 1) return null;

  const now = parseFloat(klines[klines.length - 1][4]);
  const past = parseFloat(klines[klines.length - 1 - minutes][4]);

  return (now - past) / past;
}

async function sendTelegram(msg) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: msg,
    }),
  });
}

// 防重复报警
function loadState() {
  try {
    return JSON.parse(fs.readFileSync("/tmp/state.json"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync("/tmp/state.json", JSON.stringify(state));
}

export default async function handler(req, res) {
  try {
    console.log("🚀 ETH/BTC收益差检查");

    const eth = await fetchKlines("ETHUSDT");
    const btc = await fetchKlines("BTCUSDT");

    const state = loadState();
    let alertMsg = [];

    for (const [name, minutes] of Object.entries(PERIODS)) {
      const ethRet = calcReturn(eth, minutes);
      const btcRet = calcReturn(btc, minutes);

      if (ethRet == null || btcRet == null) continue;

      const diff = ethRet - btcRet;
      const absDiff = Math.abs(diff);

      console.log(name, diff);

      if (absDiff >= THRESHOLD) {
        if (state[name] !== true) {
          alertMsg.push(
            `${name} 收益差 ${(diff * 100).toFixed(2)}%`
          );
          state[name] = true;
        }
      } else {
        state[name] = false;
      }
    }

    if (alertMsg.length > 0) {
      await sendTelegram(
        `🚨 ETH/BTC收益差超2%\n\n${alertMsg.join("\n")}`
      );
    }

    saveState(state);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
