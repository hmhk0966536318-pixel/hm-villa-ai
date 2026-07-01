import { getAvailabilityResult, checkAvailability } from "./availability.js";
import { createBookingRequest } from "./booking.js";
import { getFaqReply } from "./faq.js";
import { askOpenAI, shouldUseOpenAI } from "./openai.js";
import { bookingTemplate, hasBookingForm, isBookingInquiry, normalizeDate, normalizeText } from "./utils.js";

export async function routeMessage(userText) {
  const text = normalizeText(userText);

  const silentWords = [
    "好",
    "好的",
    "好喔",
    "好哦",
    "ok",
    "okay",
    "收到",
    "了解",
    "謝謝",
    "謝謝你",
    "感謝",
    "哈哈",
    "嗯",
    "嗯嗯",
    "可以",
    "我再看看",
    "我再想想"
  ];

  if (silentWords.includes(text)) return null;

  if (["真人", "小編", "有人嗎", "客服"].includes(text)) {
    return "您好😊 小編看到後會盡快協助您，請直接留下您的問題或需求。";
  }

  if (hasBookingForm(userText)) {
    return await createBookingRequest(userText);
  }

  if (isBookingInquiry(userText) && normalizeDate(userText)) {
    const availability = await getAvailabilityResult(userText);
    if (!availability) return bookingTemplate("");

    if (!availability.bookable) return availability.message;

    return `${availability.message}

請填寫以下資料後回傳，渼寶會協助建立訂房需求：

入住日期：${availability.date}
入住人數：
包棟或單間：
房型需求：
聯絡電話：
訂房姓名：`;
  }

  if (isBookingInquiry(userText)) {
    return bookingTemplate("");
  }

  const availabilityReply = await checkAvailability(userText);
  if (availabilityReply) return availabilityReply;

  const faqReply = getFaqReply(userText);
  if (faqReply) return faqReply;

  if (shouldUseOpenAI(userText)) {
    return await askOpenAI(userText);
  }

  return null;
}
