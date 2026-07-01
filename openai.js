import OpenAI from "openai";
import { config } from "./config.js";
import { normalizeText } from "./utils.js";
import { logError } from "./logger.js";

const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

export function shouldUseOpenAI(userText) {
  const text = normalizeText(userText);

  const triggers = [
    "介紹",
    "附近",
    "景點",
    "美食",
    "推薦",
    "適合",
    "親子",
    "老人",
    "長輩",
    "行程",
    "怎麼玩",
    "特色",
    "環境"
  ];

  return triggers.some(key => text.includes(key));
}

export async function askOpenAI(userText) {
  try {
    if (!openai) return null;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "你是禾渼會館的LINE小管家渼寶。請用繁體中文簡短回答。不要保證房況，不要直接成立訂房，不要亂報價格。"
        },
        {
          role: "user",
          content: userText
        }
      ]
    });

    return response.output_text || null;
  } catch (error) {
    logError("OpenAI 回覆失敗", error);
    return null;
  }
}
