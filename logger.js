export function logStep(label, data = {}) {
  const time = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  console.log(`[${time}] ${label}`, data);
}

export function logError(label, error) {
  const time = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  console.error(`[${time}] ${label}`, error);
}
