// Photo and voice capture for the composer.

const readAsDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const f = new FileReader()
    f.onload = () => resolve(String(f.result))
    f.onerror = () => reject(f.error ?? new Error('could not read the file'))
    f.readAsDataURL(blob)
  })

const MAX_EDGE = 1600

/** A photo, scaled down to at most 1600 px on its long edge so it uploads quickly. */
export async function preparePhoto(file: File): Promise<{ data: string; mime: string; preview: string }> {
  const original = await readAsDataURL(file)
  try {
    const img = new Image()
    img.src = original
    await img.decode()
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    if (scale >= 1 && file.size < 1_500_000) {
      return { data: original.split(',')[1] ?? '', mime: file.type || 'image/jpeg', preview: original }
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/jpeg', 0.85)
    return { data: url.split(',')[1] ?? '', mime: 'image/jpeg', preview: url }
  } catch {
    return { data: original.split(',')[1] ?? '', mime: file.type || 'image/jpeg', preview: original }
  }
}

export interface Recording {
  stop: () => Promise<{ data: string; mime: string; seconds: number } | null>
  cancel: () => void
}

/** Starts recording from the microphone. Throws if there is no microphone or no permission. */
export async function startRecording(): Promise<Recording> {
  if (!window.isSecureContext) throw new Error('insecure') // plain http: browsers hide the microphone
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('unsupported')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const chunks: Blob[] = []
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream)
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    throw e
  }
  const started = Date.now()
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  recorder.start()
  const release = () => stream.getTracks().forEach((t) => t.stop())
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = async () => {
          release()
          const mime = (recorder.mimeType || 'audio/webm').split(';')[0] ?? 'audio/webm'
          if (!chunks.length) return resolve(null)
          const url = await readAsDataURL(new Blob(chunks, { type: mime }))
          resolve({
            data: url.split(',')[1] ?? '',
            mime,
            seconds: Math.max(1, Math.round((Date.now() - started) / 1000)),
          })
        }
        recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = release
      if (recorder.state !== 'inactive') recorder.stop()
      else release()
    },
  }
}

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/**
 * Opens the composer's camera or photo library from elsewhere on the page (the welcome screen's
 * "Take a photo" button). The event is handled synchronously, inside the tap, so the browser still
 * allows the file picker to open.
 */
export const PHOTO_PICKER_EVENT = 'aisle-guide:photo-picker'
export function openPhotoPicker(source: 'camera' | 'library') {
  window.dispatchEvent(new CustomEvent(PHOTO_PICKER_EVENT, { detail: source }))
}
