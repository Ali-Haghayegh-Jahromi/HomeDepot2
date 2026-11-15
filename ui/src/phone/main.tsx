import { mount } from '../shared/Root'
import { MirrorRoot } from './MirrorView'
import { PhoneRoot } from './PhoneApp'

const params = new URLSearchParams(window.location.search)
const session = params.get('s')
document.documentElement.classList.add('page-phone')
if (params.get('view') === 'mirror') {
  // the stage's live mirror of the customer's phone (read-only)
  document.documentElement.classList.add('page-mirror')
  mount('stage', () => session, <MirrorRoot />)
} else {
  mount('phone', () => session, <PhoneRoot />)
}
