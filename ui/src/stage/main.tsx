import { mount } from '../shared/Root'
import { StageApp } from './StageApp'
import { StudioApp } from './Studio'

document.documentElement.classList.add('page-stage')
const studio = new URLSearchParams(window.location.search).get('view') === 'studio'
mount('stage', () => new URLSearchParams(window.location.search).get('s'), studio ? <StudioApp /> : <StageApp />)
