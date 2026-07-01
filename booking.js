import { config } from "./config.js";
import { getAvailabilityResult } from "./availability.js";
import { getField, normalizeDate } from "./utils.js";
import { logError, logStep } from "./logger.js";

function parseBookingInfo(text) {
  const raw = String(text || "");

  const dateField = getField(raw, ["入住日期"]);
  const people = getField(raw, ["入住人數"]);
  const roomField = getField(raw, ["包棟或單間", "房型需求"]);
  const phoneField = getField(raw, ["聯絡電話", "電話"]);
  const name = getField(raw, ["訂房姓名", "姓名"]);
  const checkOutField = getField(raw, ["退房日期"]);

  const phoneMatch = raw.match(/09\d{8}/);

  const adultMatch =
    people.match(/(\d+)\s*(?:大|大人|成人)/) ||
    raw.match(/(\d+)\s*(?:大|大人|成人)/);

  const childMatch =
    people.match(/(\d+)\s*(?:小|小孩|兒童|小朋友)/) ||
    raw.match(/(\d+)\s*(?:小|小孩|兒童|小朋友)/);

  const roomType =
    roomField.includes("包棟") || raw.includes("包棟")
      ? "包棟"
      : (roomField.match(/20[123]|30[12]/)?.[0] ||
         raw.match(/20[123]|30[12]/)?.[0] ||
         roomField ||
         "");

  return {
    checkIn: normalizeDate(dateField || raw) || "",
    checkOut: normalizeDate(checkOutField) || "",
    name,
    phone: phoneField || (phoneMatch ? phoneMatch[0] : ""),
    adult: adultMatch ? adultMatch[1] : "",
    child: childMatch ? childMatch[1] : "",
    people,
    roomType,
    note: raw
  };
}

function missingFields(info) {
  const missing = [];

  if (!info.checkIn) missing.push("入住日期");
  if (!info.people && !info.adult && !info.child) missing.push("入住人數");
  if (!info.roomType) missing.push("包棟或單間 / 房型需求");
  if (!info.phone) missing.push("聯絡電話");
  if (!info.name) missing.push("訂房姓名");

  return missing;
}

function missingReply(missing) {
  return `🌾 渼寶收到您的訂房資料囉！
目前還缺以下資料：

${missing.map(item => `・${item}`).join("\n")}

請補齊後再送出，格式如下：
入住日期：
入住人數：
包棟或單間：
房型需求：
聯絡電話：
訂房姓名：`;
}

export async function createBookingRequest(userText) {
  const info = parseBookingInfo(userText);
  const missing = missingFields(info);

  if (missing.length > 0) {
    return missingReply(missing);
  }

  const availability = await getAvailabilityResult(info.checkIn);
  if (availability && !availability.bookable) {
    return `${availability.message}

⚠️ 因此渼寶不會建立訂單，避免重複接單。`;
  }

  try {
    if (!config.bookingApiUrl) {
      return "⚠️ 訂房系統尚未設定，請小編協助建立訂單。";
    }

    const params = new URLSearchParams();
    params.set("action", "addOrder");
    params.set("checkIn", info.checkIn);
    params.set("checkOut", info.checkOut);
    params.set("name", info.name);
    params.set("phone", info.phone);
    params.set("adult", info.adult);
    params.set("child", info.child);
    params.set("roomType", info.roomType);
    params.set("note", info.note);
    params.set("source", "LINE");
    params.set("status", "待收訂");

    const glue = config.bookingApiUrl.includes("?") ? "&" : "?";
    const url = `${config.bookingApiUrl}${glue}${params.toString()}`;

    logStep("建立訂單送出", {
      checkIn: info.checkIn,
      roomType: info.roomType,
      name: info.name
    });

    const res = await fetch(url);
    const rawText = await res.text();

    let result = {};
    try {
      result = JSON.parse(rawText.replace(/^[^(]*\(/, "").replace(/\);\s*$/, ""));
    } catch (error) {
      logError("建立訂單回傳不是 JSON", rawText);
    }

    if (result.success) {
      logStep("建立訂單成功", { orderId: result.orderId });

      return `👧🏻 渼寶已收到您的訂房需求！

🆔 訂單編號：${result.orderId}

📌 小編將盡快為您確認房況、費用及訂金資訊。

⚠️ 此為訂房需求詢問，尚未完成正式訂房。
訂房需經小編確認房況，並於訂金完成後才算保留成功。`;
    }

    logError("建立訂單失敗", rawText);
    return "⚠️ 訂房需求送出失敗，請稍後再試，或請小編協助建立。";
  } catch (error) {
    logError("建立訂單錯誤", error);
    return "⚠️ 訂房需求送出失敗，請稍後再試，或請小編協助建立。";
  }
}
