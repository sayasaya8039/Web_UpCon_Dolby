/**
 * Background Service Worker
 * 設定管理とタブ間の同期を担当
 */

import type { AudioSettings, ExtensionMessage } from '@/types/audio.types';
import { DEFAULT_SETTINGS } from '@/constants/presets';

const STORAGE_KEY = 'webUpconDolby_settings';

/**
 * 設定を読み込み
 */
async function loadSettings(): Promise<AudioSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as AudioSettings | undefined;
  return stored ?? DEFAULT_SETTINGS;
}

/**
 * 設定を保存
 */
async function saveSettings(settings: AudioSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

/**
 * 全タブに設定を送信
 */
async function broadcastSettings(settings: AudioSettings): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SET_SETTINGS',
          payload: settings,
        });
      } catch {
        // タブにContent Scriptがない場合は無視
      }
    }
  }
}

/**
 * メッセージハンドラー
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'GET_SETTINGS': {
          const settings = await loadSettings();
          sendResponse(settings);
          break;
        }

        case 'SET_SETTINGS': {
          const settings = message.payload as AudioSettings;
          await saveSettings(settings);
          await broadcastSettings(settings);
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    })();
    return true; // 非同期レスポンスを許可
  }
);

/**
 * 拡張機能インストール時
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 初回インストール時にデフォルト設定を保存
    await saveSettings(DEFAULT_SETTINGS);
    console.log('[Web UpCon Dolby] 初期設定を保存しました');
  }
});

/**
 * アイコンクリック時（Popupがない場合のフォールバック）
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    const settings = await loadSettings();
    const newSettings = { ...settings, enabled: !settings.enabled };
    await saveSettings(newSettings);
    await broadcastSettings(newSettings);

    // バッジで状態を表示
    chrome.action.setBadgeText({
      text: newSettings.enabled ? 'ON' : '',
      tabId: tab.id,
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#38bdf8',
      tabId: tab.id,
    });
  }
});

console.log('[Web UpCon Dolby] Service Worker 起動');
