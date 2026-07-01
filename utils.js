export function normalizeText(text = "") {
  return String(text).trim().toLowerCase();
}

export function normalizeDate(input = "") {
  const text = String(input || "");

  const ymd = text.match(/(20\d{2})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}/${String(ymd[2]).padStart(2, "0")}/${String(ymd[3]).padStart(2, "0")}`;
  }

  const md = text.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if (md) {
    const year = new Date().getFullYear();
    return `${year}/${String(md[1]).padStart(2, "0")}/${String(md[2]).padStart(2, "0")}`;
  }

  return null;
}

export function getField(text, labels) {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:：]\\s*([^\\n]+)`, "i");
    const match = String(text || "").match(re);
    if (match) return match[1].trim();
  }
  return "";
}

export function hasBookingForm(text = "") {
  const raw = String(text || "");
  return (
    raw.includes("入住日期") &&
    raw.includes("入住人數") &&
    (raw.includes("包棟或單間") || raw.includes("房型需求")) &&
    (raw.includes("聯絡電話") || raw.includes("電話")) &&
    (raw.includes("訂房姓名") || raw.includes("姓名"))
  );
}

export function isBookingInquiry(text = "") {
  const value = normalizeText(text);
  return (
    value.includes("我要訂房") ||
    value.includes("想訂房") ||
    value.includes("訂房") ||
    value.includes("保留") ||
    value.includes("下訂")
  );
}

export function bookingTemplate(dateText = "") {
  return `您好😊 若要建立訂房需求，請複製以下格式填寫：

入住日期：${dateText || ""}
入住人數：
包棟或單間：
房型需求：
聯絡電話：
訂房姓名：

📌 此為訂房需求，需小編確認房況與訂金後才算正式保留。`;
}
