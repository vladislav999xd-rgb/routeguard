import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

type StoryMotionOptions = {
  node: HTMLElement
  progress: { current: number }
  onActiveScene: (scene: number) => void
}

export function setupStoryMotion({ node, progress, onActiveScene }: StoryMotionOptions) {
  const sections = Array.from(node.querySelectorAll<HTMLElement>('[data-scene]'))
  const track = node.querySelector<HTMLElement>('.story-track')
  if (!track || sections.length === 0) return () => undefined

  let activeScene = 1
  let removeAnchorListeners: () => void = () => {}
  const context = gsap.context(() => {
    gsap.set(sections, { autoAlpha: 0, yPercent: 12, scale: 0.965, pointerEvents: 'none' })
    gsap.set(sections[0], { autoAlpha: 1, yPercent: 0, scale: 1, pointerEvents: 'auto' })

    const timeline = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        progress.current = self.progress
        node.style.setProperty('--story-progress', `${self.progress * 100}%`)
        const nextScene = Math.min(7, Math.max(1, Math.floor(self.progress * 7) + 1))
        if (nextScene !== activeScene) {
          sections.forEach((section, index) => {
            const isActive = index + 1 === nextScene
            section.classList.toggle('is-active', isActive)
            section.style.pointerEvents = isActive ? 'auto' : 'none'
          })
          activeScene = nextScene
          onActiveScene(nextScene)
        }
      },
      },
    })

    sections.forEach((section, sectionIndex) => {
      const at = sectionIndex
      if (sectionIndex > 0) {
        timeline.fromTo(section,
          { autoAlpha: 0, yPercent: 14, scale: 0.955 },
          { autoAlpha: 1, yPercent: 0, scale: 1, duration: 0.28 },
          at - 0.16,
        )
      }
      if (sectionIndex < sections.length - 1) {
        timeline.to(section,
          { autoAlpha: 0, yPercent: -12, scale: 1.035, duration: 0.28 },
          at + 0.72,
        )
      }
    })

    timeline.fromTo('.story-card-grid article', { y: 90, z: -120, rotateY: -10 }, { y: 0, z: 0, rotateY: 0, stagger: 0.05, duration: 0.34 }, 0.86)
    timeline.fromTo('.route-steps li', { x: -80, rotateY: -10 }, { x: 0, rotateY: 0, stagger: 0.055, duration: 0.34 }, 1.86)
    timeline.fromTo('.story-product', { y: 110, rotateY: -15, scale: 0.88 }, { y: 0, rotateY: -3, scale: 1, duration: 0.42 }, 2.84)
    timeline.fromTo('.call-card', { x: -120, rotateY: 15, scale: 0.88 }, { x: 0, rotateY: 0, scale: 1, duration: 0.42 }, 3.84)
    timeline.fromTo('.analytics-card', { y: 100, rotateX: 12, scale: 0.88 }, { y: 0, rotateX: 0, scale: 1, duration: 0.42 }, 4.84)
    timeline.fromTo('.final-panel', { scale: 0.82, rotateX: 8, borderRadius: '6rem' }, { scale: 1, rotateX: 0, borderRadius: '2.7rem', duration: 0.5 }, 5.82)
    timeline.to({}, { duration: 0.45 }, 6.35)

    const jumpToScene = (event: Event) => {
      const anchor = event.currentTarget as HTMLAnchorElement
      const target = anchor.getAttribute('href')
      if (!target?.startsWith('#')) return
      const targetSection = target === '#top' || target === '#content'
        ? sections[0]
        : node.querySelector<HTMLElement>(target)
      const scene = Number(targetSection?.dataset.scene ?? 1)
      const scrollRange = track.offsetHeight - window.innerHeight
      event.preventDefault()
      window.scrollTo({ top: track.offsetTop + scrollRange * ((scene - 1) / (sections.length - 1)), behavior: 'smooth' })
    }
    const anchors = Array.from(node.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
    anchors.forEach((anchor) => anchor.addEventListener('click', jumpToScene))
    removeAnchorListeners = () => anchors.forEach((anchor) => anchor.removeEventListener('click', jumpToScene))
  }, node)

  sections[0]?.classList.add('is-active')
  ScrollTrigger.refresh()
  return () => {
    removeAnchorListeners()
    context.revert()
  }
}
