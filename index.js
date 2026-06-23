import express from "express";
import crypto from "crypto";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const AVAILABILITY_API_URL = process.env.AVAILABILITY_API_URL;
const BOOKING_API_URL = process.env.BOOKING_API_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
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
     return null;
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

async function askOpenAI(userText) {
  try {
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY 沒有讀到");
      return null;
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
         {
  role: "system",
  content: `
你是禾渼會館的LINE小管家渼寶。

請使用繁體中文回答。

已知資訊：
- 禾渼會館位於宜蘭縣冬山鄉
- 共有5間房
- 可包棟
- 有泳池（夏季開放並設有遮陽）
- 有球池
- 有嚕嚕車
- 有KTV
- 有麻將桌
- 客廳約30坪
- 有電梯
- 房內多數有浴缸
- 房內提供澡盆及消毒鍋

回答規則：
1. 像真人民宿櫃台一樣聊天。
2. 回覆簡短自然。
3. 客人閒聊請正常回覆。
4. 客人詢問人數是否適合時，先回答問題。
5. 客人詢問房況時，再請提供入住日期。
6. 不保證房況。
7. 不直接成立訂房。
8. 不亂報價格。
9. 若不知道答案，請請客人留下資訊由小編協助。
`
}
        {
          role: "user",
          content: userText
        }
      ]
    });

    console.log("OpenAI回覆：", response.output_text);
    return response.output_text || null;
  } catch (error) {
    console.error("OpenAI 回覆失敗：", error);
    return null;
  }
}


async function replyText(userText) {
  const text = userText.toLowerCase();

   const silentWords = [
    "好",
    "好的",
    "好的唷",
    "好喔",
    "好哦",
    "ok",
    "okay",
    "收到",
    "了解",
    "等等",
    "等一下",
    "討論",
    "討論一下",
    "我再想想",
    "我再看看",
    "謝謝",
    "謝謝你",
    "謝謝您",
    "感謝",
    "感謝你",
    "感謝您"
  ];

  if (silentWords.includes(text.trim())) {
  return null;
}
  if (silentWords.includes(text.trim())) {
  return null;
}

  
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

if (text.includes("水質")) {
    return "目前戲水池都放地下水，如需放自來水加收1,000元。";
  }

if (text.includes("換水")) {
    return "目前都是入住當天洗池放新水。";
  }

  
  if (text.includes("戲水池") || text.includes("玩水")|| text.includes("泳池")|| text.includes("水池")) {
    return "夏季期間戲水池會開放使用，並設有遮陽設備，實際開放依天候及現場狀況調整。";
  }

  if (text.includes("寵物") || text.includes("狗") || text.includes("貓")|| text.includes("兔")) {
    return "目前禾渼會館暫不提供寵物入住服務，敬請見諒。";
  }

  if (text.includes("停車")) {
    return "禾渼會館有提供停車空間，停自家庭園。";
  }
  
if (text.includes("訂金如何支付") || text.includes("帳號")|| text.includes("付款")) {
    return "中國信託（822）帳號：164540184542。匯款後請提供後五碼。";
  }

if (text.includes("房間有陽台嗎") || text.includes("陽台")|| text.includes("抽菸")) {
    return "禾渼會館房型皆設有陽台，菸蒂請集中，室內臥室廁所禁菸。";
  }

if (text.includes("有哪些親子設施")|| text.includes("設施")) {
    return "戲水池、球池（依房型）、嚕嚕車、澡盆、消毒鍋等。";
  }
  
if (text.includes("取消訂房")) {
    return "依交通部觀光署定型化契約辦理。";
  }

if (text.includes("電梯")) {
    return "有。";
  }

if (
  text.includes("wifi") ||
  text.includes("網路") ||
  text.includes("密碼") ||
  text.includes("無線網路")
) {
  return "📶 禾渼會館全館提供免費 Wi-Fi直接連 禾渼館內 無密碼。";
}

  
if (text.includes("附近有便利商店")|| text.includes("便利商店")|| text.includes("7-11")|| text.includes("全家")) {
    return "鄰近皆有生活機能，歡迎詢問。";
  }

if (text.includes("延後退房")|| text.includes("延遲退房")) {
    return "可以，需加延長費請洽小編。";
  }

if (text.includes("刷卡")) {
    return "目前無提供刷卡服務。";
  }

if (text.includes("國旅卡")) {
    return "目前無提供國旅卡服務。";
  }

if (
  text.includes("一樓房") ||
  text.includes("一樓房間") ||
  text.includes("長輩") ||
  text.includes("爬樓梯")
) {
  return "目前一樓無提供房間，但館內設有電梯，可直達入住樓層😊";
}

  
if (text.includes("可以保留房間嗎")|| text.includes("保留")) {
    return "訂金完成後才算保留成功。";
  }

if (text.includes("可以唱歌")|| text.includes("唱歌")|| text.includes("限時")) {
    return "可以，原聲原影非伴唱帶畫面，目前唱歌無限時，晚上10點後請降低音量，如被檢舉由旅客承擔。";
  }

if (text.includes("烤肉")) {
    return "可以，無收人頭費與清潔費用完請收拾乾淨，無收拾會扣清潔費，晚上10點後禁止戶外活動。";
  }

if (text.includes("可以外燴")|| text.includes("外燴")|| text.includes("代烤")) {
    return "可以自行找廠商或請詢問小編推薦廠商，晚上10點後禁止戶外活動。";
  }

if (text.includes("代訂食材")|| text.includes("食材")) {
    return "可以，請找小編要目錄。";
  }
if (text.includes("房型")) {
    return "禾渼共五間房，四人-2間，兩大一小-1間，兩大兩小-2間，可入住10大9小或14大5小共計19位入住。";
  }
  
if (text.includes("煙火")) {
    return "可以，放完煙火請集中請收拾乾淨，無收拾會扣清潔費，晚上10點後禁止戶外活動禁放煙火。";
  }

if (text.includes("抽菸")) {
    return "戶外可以抽菸，菸蒂請集中，亂丟菸蒂會扣清潔費。";
  }

  if (
    text === "真人" ||
    text === "小編" ||
    text === "有人嗎"
  ) {
    return "您好😊 小編在線上，請直接留下您的問題即可。";
  }

 console.log("準備送OpenAI:", userText);

const aiReply = await askOpenAI(userText);

console.log("OpenAI結果:", aiReply);

if (aiReply) return aiReply;

return "🌾 渼寶收到囉！小編看到後會盡快協助您😊";
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

    if (reply) {
      await replyMessage(event.replyToken, reply);
    }
  }
}

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Meibao bot running on port ${PORT}`);
});
