import type { MessageKey } from "./en";

/** Simplified Chinese overrides; missing keys fall back to the en dictionary. */
export const zhCN: Partial<Record<MessageKey, string>> = {
  "settings.general.heading": "通用配置",
  "settings.general.description": "网关服务器字段编辑此本地网关。文件访问与上传默认值编辑 {target}。",
  "settings.general.reload": "重新加载",
  "settings.interface.heading": "界面",
  "settings.interface.description": "浏览器本地偏好，更改后立即生效。",
  "settings.interface.language": "语言",
  "settings.interface.languageSystem": "跟随浏览器",
  "settings.interface.languageHint": "选择 PI WEB 界面的显示语言。",
};
