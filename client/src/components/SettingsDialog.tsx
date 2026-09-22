/** AI 服务设置弹窗（API Key / 模型名） */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { DEFAULT_MODEL, getAiSettings, saveAiSettings } from '../lib/settings'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) {
      const s = getAiSettings()
      setApiKey(s.apiKey)
      setModel(s.model)
      setSaved(false)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30"
      onClick={onClose}
    >
      <div
        className="w-[26rem] rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">AI 服务设置</h2>
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              DeepSeek API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-...（留空则使用服务端 .env 配置）"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              仅保存在本地浏览器；请求经服务端转发，不会暴露在页面代码中。
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">模型名称</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODEL}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              默认 deepseek-flash；如官方调整模型名可直接在此修改。
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-emerald-600">已保存</span>}
          <button
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => {
              saveAiSettings({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL })
              setSaved(true)
              setTimeout(onClose, 500)
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
