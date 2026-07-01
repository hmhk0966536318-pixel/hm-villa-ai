import { config } from "./config.js";
import { normalizeDate } from "./utils.js";
import { logError } from "./logger.js";

function getDateType(dateText, status = "") {
  if (status.includes("連假")) return "連假";
  if (status.includes("僅接包棟")) return "假日";

  const date = new Date(dateText);
  const day = date.getDay();

  if (day === 5) return "旺日";
  if (day === 6) return "假日";
  return "平日";
}

function isFullStatus(status = "") {
  const s = String(status || "");
  return (
    s.includes("已訂") ||
    s.includes("已售") ||
    s.includes("包棟已訂") ||
    s.includes("不可訂") ||
    s.includes("關閉")
  );
}

function isBookableStatus(status = "") {
  const s = String(status || "");
  return (
    s.includes("可預訂") ||
    s.includes("可售") ||
    s.includes("正常") ||
    s.includes("僅接包棟")
  );
}

async function getVillaPriceText(dateType) {
  try {
    if (!config.priceApiUrl) return "🏡 包棟參考房價：請洽小編";

    const res = await fetch(config.priceApiUrl);
    const prices = await res.json();
    const villa = prices.find(row => row["房型"] === "包棟");

    if (!villa) return "🏡 包棟參考房價：請洽小編";

    return `🏡 包棟參考房價：${villa[dateType]}元`;
  } catch (error) {
    logError("房價表讀取失敗", error);
    return "🏡 包棟參考房價：請洽小編";
  }
}

export async function getAvailabilityResult(userText) {
  const date = normalizeDate(userText);
  if (!date) return null;

  try {
    if (!config.availabilityApiUrl) {
      return {
        date,
        bookable: false,
        status: "系統未設定",
        message: "渼寶目前無法讀取房況系統，請小編協助確認。"
      };
    }

    const res = await fetch(config.availabilityApiUrl);
    const rows = await res.json();
    const found = rows.find(row => row["日期"] === date);

    if (!found) {
      return {
        date,
        bookable: false,
        status: "未查到",
        message: `🌾 渼寶幫您收到 ${date} 的查詢囉！
目前系統尚未查到這天房況，請留下入住人數，小編協助確認😊`
      };
    }

    const status = found["狀態"] || found["模式"] || "未標示";
    const rawNote = found["備註"] || "";
    const note = rawNote ? `\n備註：${rawNote}` : "";

    if (isFullStatus(status)) {
      return {
        date,
        bookable: false,
        status,
        message: `很抱歉，${date} 目前已無法預訂囉🥹
狀態：${status}${note}

歡迎提供其他日期，渼寶再幫您查詢。`
      };
    }

    if (isBookableStatus(status)) {
      const dateType = getDateType(date, `${status} ${rawNote}`);
      const villaPriceText = await getVillaPriceText(dateType);

      return {
        date,
        bookable: true,
        status,
        message: `🌾 渼寶幫您查詢到 ${date} 目前可預訂喔！

日期類型：${dateType}
${villaPriceText}

📌 實際成交價格與優惠方案，仍以小編最後確認為主。${note}`
      };
    }

    return {
      date,
      bookable: false,
      status,
      message: `🌾 渼寶幫您查詢 ${date}，目前狀態為：${status}。${note}`
    };
  } catch (error) {
    logError("房況查詢錯誤", error);
    return {
      date,
      bookable: false,
      status: "查詢錯誤",
      message: "渼寶查詢房況時遇到一點小狀況🥹 請小編協助確認。"
    };
  }
}

export async function checkAvailability(userText) {
  const result = await getAvailabilityResult(userText);
  return result ? result.message : null;
}
