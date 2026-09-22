/** 浏览器下载工具 */

export function downloadDataUri(dataUri?: string | null, filename?: string): void {
  if (!dataUri) return
  const a = document.createElement('a')
  a.href = dataUri
  a.download = filename || 'diagram'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadText(text: string, filename: string, mime = 'application/xml'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
