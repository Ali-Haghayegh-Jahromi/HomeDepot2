import { mount } from '../shared/Root'
import { MirrorRoot, PreviewRoot } from './MirrorView'
import { PhoneRoot } from './PhoneApp'

const params = new URLSearchParams(window.location.search)
const session = params.get('s')
document.documentElement.classList.add('page-phone')
// Android Chrome: let the keyboard shrink the page, so the message box stays above it. (Only there:
// iOS Safari does not know the key and logs a console error for it.)
if (/Android/i.test(navigator.userAgent)) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (meta && !meta.content.includes('interactive-widget'))
    meta.content += ', interactive-widget=resizes-content'
}
if (params.get('view') === 'preview') {
  // the stage's idle phone: the welcome screen as a customer will see it (read-only, no visit)
  document.documentElement.classList.add('page-mirror')
  mount('stage', () => null, <PreviewRoot />)
} else if (params.get('view') === 'mirror') {
  // the stage's live mirror of the customer's phone (read-only)
  document.documentElement.classList.add('page-mirror')
  mount('stage', () => session, <MirrorRoot />)
} else {
  mount('phone', () => session, <PhoneRoot />)
}
