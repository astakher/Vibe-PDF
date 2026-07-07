import { useUiStore } from '../store'

export function InfoBanner() {
  const notice = useUiStore((s) => s.notice)
  if (!notice) return null
  return (
    <div className={`info-banner info-${notice.kind}`}>
      <span>{notice.message}</span>
      <button
        className="banner-close"
        title="Dismiss"
        onClick={() => useUiStore.getState().setNotice(null)}
      >
        ✕
      </button>
    </div>
  )
}
