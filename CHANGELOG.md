# HM-VILLA-AI CHANGELOG

## V6.0.0 Foundation

- 拆分原本大型 `index.js`
- 新增 `config.js`
- 新增 `utils.js`
- 新增 `availability.js`
- 新增 `booking.js`
- 新增 `faq.js`
- 新增 `openai.js`
- 新增 `router.js`
- 新增 `logger.js`
- `index.js` 只保留 LINE Webhook 與回覆功能
- 訂房流程：
  - 我要訂房 + 日期 → 先查房況
  - 滿房 → 不建單
  - 可訂 → 回填寫格式
  - 回傳完整格式 → 建立訂單
- OpenAI 改為低敏感，只在景點、美食、推薦、介紹等情境啟動
