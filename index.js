import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const AVAILABILITY_API_URL = process.env.AVAILABILITY_API_URL;
const BOOKING_API_URL = process.env.BOOKING_API_URL;
const PRICE_API_URL = process.env.PRICE_API_URL;

function checkSignature(req) {
  const signature = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("SHA256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

function normalizeDate(input) {
  const match = input.match(/(\d{1,2})[\/月](\d{1,2})/);
  if (!match) return null;

  const year = new Date().getFullYear();
  const month = String(match[1]).padStart(2, "0");
  const day = String(match[2]).padStart(2, "0");

  return `${year}/${month}/${day}`;
}
function getDateType(dateText, status = "") {
  if (status.includes("僅接包棟") || status.includes("連假")) return "假日";

  const date = new Date(dateText);
  const day = date.getDay();

  if (day === 5) return "旺日"; // 週五
  if (day === 6) return "假日"; // 週六
  return "平日"; // 週日～週四
}
async function getVillaPriceText(dateType) {
  try {
    const res = await fetch(PRICE_API_URL);
    const prices = await res.json();

    const villa = prices.find(r => r["房型"] === "包棟");

    if (!villa) {
      return "🏡 包棟參考房價：請洽小編";
    }

    const price = villa[dateType];

    return `🏡 包棟參考房價：${price}元`;

  } catch (error) {
    console.error("房價表讀取失敗：", error);
    return "🏡 包棟參考房價：請洽小編";
  }
}

async function checkAvailability(userText) {
  const date = normalizeDate(userText);
  if (!date) return null;

  try {
    const res = await fetch(AVAILABILITY_API_URL);
    const data = await res.json();

    const found = data.find((row) => row["日期"] === date);

    if (!found) {
      return `🌾 渼寶幫您查詢 ${date}，目前尚未查到房況資料，請留下人數與需求，小編協助確認😊`;
    }

    const status = found["狀態"] || "未標示";
    const note = found["備註"] ? `\n備註：${found["備註"]}` : "";

    if (status.includes("可預訂")) {
  const dateType = getDateType(date, status);
  const villaPriceText = await getVillaPriceText(dateType);

  return `🌾 渼寶幫您查詢到 ${date} 目前可預訂喔！

日期類型：${dateType}
${villaPriceText}

📌 如需單間訂房，歡迎告知入住人數及需求，小編將協助推薦合適房型與報價。

📌 實際成交價格與優惠方案，仍以小編最後確認為主。

若需保留，請留下入住人數及聯絡方式，小編協助您確認訂房😊${note}`;
}

    if (status.includes("已訂")) {
      return `很抱歉，${date} 目前已訂出囉🥹\n\n歡迎提供其他日期，渼寶再幫您查詢。${note}`;
    }

    if (status.includes("不可訂") || status.includes("關閉")) {
      return `很抱歉，${date} 目前暫不開放預訂。\n\n歡迎提供其他日期，小編協助確認😊${note}`;
    }

    if (status.includes("僅接包棟")) {
      return `🌾 ${date} 目前僅接包棟，不開放單間訂房。

🏡 包棟參考房價：30,000元

📌 實際成交價格與優惠方案，仍以小編最後確認為主。

如需包棟，請提供入住人數，小編協助報價😊${note}`;
    }
    return `🌾 渼寶幫您查詢 ${date}，目前狀態為：${status}。${note}`;
   } catch (error) {
  console.error("checkAvailability錯誤：", error);

  return "渼寶查詢房況時遇到一點小狀況🥹 請留下入住日期、人數及需求，小編會協助確認。";
}
}

function parseBookingInfo(text) {
  const phoneMatch = text.match(/09\d{8}/);
  const dateMatch = text.match(/(\d{1,2})[\/月](\d{1,2})/);

  const checkIn = dateMatch
    ? `${new Date().getFullYear()}/${String(dateMatch[1]).padStart(2, "0")}/${String(dateMatch[2]).padStart(2, "0")}`
    : "";

  const peopleMatch = text.match(/入住人數[:：]?\s*([^\n]+)/);
  const roomMatch = text.match(/包棟或單間[:：]?\s*([^\n]+)/);
  const nameMatch = text.match(/(?:訂房)?姓名[:：]?\s*([^\n]+)/);

  return {
    checkIn,
    checkOut: "",
    name: nameMatch ? nameMatch[1].trim() : "",
    phone: phoneMatch ? phoneMatch[0] : "",
    people: peopleMatch ? peopleMatch[1].trim() : "",
    roomType: roomMatch ? roomMatch[1].trim() : "",
    note: text
  };
}

async function createBookingRequest(userText) {
  const info = parseBookingInfo(userText);

  if (!info.phone || !info.checkIn || !info.name) {
    return null;
  }

  try {
    const res = await fetch(process.env.BOOKING_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(info)
    });

    const result = await res.json();

    if (result.success) {
      return `👧🏻 渼寶已收到您的訂房需求！\n\n🆔 訂單編號：${result.orderId}\n\n📌 小編將盡快為您確認房況、費用及訂金資訊。\n\n⚠️ 此為訂房需求詢問，尚未完成正式訂房。\n訂房需經小編確認房況，並於訂金完成後才算保留成功。\n\n🏡 禾渼會館 期待與您相見！`;
    }

    return null;
  } catch (error) {
    console.error(error);
    return "⚠️ 訂房需求送出失敗，請稍後再試。";
  }
}

async function replyText(userText) {
  const text = userText.toLowerCase();

  const bookingReply = await createBookingRequest(userText);
  if (bookingReply) return bookingReply;

 const availabilityReply = await checkAvailability(userText);
if (availabilityReply) return availabilityReply;

  if (text.includes("我要訂房") || text.includes("想訂房") || text.includes("訂房資訊") || text.includes("預訂")) {
    return "好的😊 請您先留下以下訂房需求，小編協助確認：\n\n📅 入住日期：\n👨‍👩‍👧‍👦 入住人數：\n🏠 包棟或單間：\n🛏️ 房型需求：\n📞 聯絡電話：\n👤 姓名：\n\n👧🏻 渼寶會將您的需求轉交給禾渼會館小編處理。\n\n📌 小編將依實際房況為您確認是否可預訂、費用及訂金資訊。\n\n⚠️ 此為訂房需求詢問，尚未完成正式訂房。\n訂房需經小編確認房況，並於訂金完成後才算保留成功。\n\n若小編正在整理房務或接待旅客，回覆稍有延遲，敬請見諒😊";
  }

  
  if (text.includes("空房") || text.includes("還有房")) {
    return "您好😊 請提供入住日期、入住人數及房型需求，渼寶協助您查詢空房。";
  }

  if (text.includes("包棟")) {
    return "您好😊 禾渼會館可提供包棟服務，請提供入住日期及人數，小編協助查詢與報價。";
  }

  if (text.includes("訂房") || text.includes("怎麼訂")) {
    return "確認房況後，需支付房費30%作為訂金，訂金完成後才算保留成功。";
  }

  if (text.includes("訂金") || text.includes("匯款")) {
    return "訂房需支付房費30%作為訂金 822 中信16454-0184542。匯款完成後請提供匯款帳號後五碼，小編協助確認。";
  }

  if (text.includes("入住") || text.includes("退房") || text.includes("幾點")) {
    return "入住時間為下午15:00～17:00，退房時間為隔日上午11:00前。";
  }

  if (text.includes("早餐")) {
    return "包棟方案含早餐，單間訂房依方案內容為主，訂房時會另外說明。";
  }

  if (text.includes("浴缸") || text.includes("澡盆") || text.includes("消毒鍋")) {
    return "禾渼會館房型皆有浴缸，並提供嬰兒澡盆及奶瓶消毒鍋。";
  }

  if (text.includes("戲水池") || text.includes("玩水"))|| text.includes("泳池")) {
    return "夏季期間戲水池會開放使用，並設有遮陽設備，實際開放依天候及現場狀況調整。";
  }

  if (text.includes("寵物") || text.includes("狗") || text.includes("貓")|| text.includes("兔")) {
    return "目前禾渼會館暫不提供寵物入住服務，敬請見諒。";
  }

  if (text.includes("停車")) {
    return "禾渼會館有提供停車空間，停自家庭園。";
  }

  if (text.includes("真人") || text.includes("小編") || text.includes("有人嗎") || text.includes("哈囉") || text.includes("您好")) {
    return "您好😊 歡迎來到禾渼會館！請留下入住日期、入住人數及需求，小編看到訊息後會盡快為您服務。";
  }

  return "您好😊 我是禾渼會館渼寶小管家。請留下入住日期、入住人數及想詢問的內容，小編看到後會盡快協助您。";
}

async function replyMessage(replyToken, message) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: message }]
    })
  });
}

app.get("/", (req, res) => {
  res.send("禾渼會館 渼寶小管家運作中 🌾");
});

app.post("/webhook", async (req, res) => {
  if (!checkSignature(req)) {
    return res.status(401).send("Invalid signature");
  }

  const events = req.body.events || [];

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const reply = await replyText(userText);
      await replyMessage(event.replyToken, reply);
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Meibao bot running on port ${PORT}`);
});
