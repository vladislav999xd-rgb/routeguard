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
  let activeScene = 1
  const context = gsap.context(() => {
    ScrollTrigger.create({
      trigger: node,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.75,
      onUpdate: (self) => {
        progress.current = self.progress
        node.style.setProperty('--story-progress', `${self.progress * 100}%`)
        const nextScene = Math.min(7, Math.max(1, Math.floor(self.progress * 7) + 1))
        if (nextScene !== activeScene) {
          activeScene = nextScene
          onActiveScene(nextScene)
        }
      },
    })

    sections.forEach((section, sectionIndex) => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top 66%',
        end: 'bottom 34%',
        onEnter: () => section.classList.add('is-active'),
        onEnterBack: () => section.classList.add('is-active'),
        onLeave: () => section.classList.remove('is-active'),
        onLeaveBack: () => section.classList.remove('is-active'),
      })
      if (sectionIndex === 0) return
      const copy = section.querySelectorAll('.story-copy > *, .story-kicker')
      gsap.fromTo(copy, { autoAlpha: 0, y: 72, rotateX: 7 }, {
        autoAlpha: 1,
        y: 0,
        rotateX: 0,
        stagger: 0.055,
        ease: 'power2.out',
        scrollTrigger: { trigger: section, start: 'top 78%', end: 'top 38%', scrub: 0.8 },
      })
    })

    gsap.fromTo('.story-card-grid article', { autoAlpha: 0, y: 90, z: -120, rotateY: -8 }, { autoAlpha: 1, y: 0, z: 0, rotateY: 0, stagger: 0.12, ease: 'power2.out', scrollTrigger: { trigger: '.story-problem', start: 'top 72%', end: 'top 34%', scrub: 0.85 } })
    gsap.fromTo('.route-steps li', { autoAlpha: 0, x: -62 }, { autoAlpha: 1, x: 0, stagger: 0.13, ease: 'power2.out', scrollTrigger: { trigger: '.story-route', start: 'top 68%', end: 'top 32%', scrub: 0.85 } })
    gsap.fromTo('.story-product', { autoAlpha: 0, y: 100, rotateY: -12, scale: 0.9 }, { autoAlpha: 1, y: 0, rotateY: -3, scale: 1, ease: 'power2.out', scrollTrigger: { trigger: '.story-workspace', start: 'top 70%', end: 'top 30%', scrub: 0.9 } })
    gsap.fromTo('.call-card', { autoAlpha: 0, x: -100, rotateY: 12, scale: 0.9 }, { autoAlpha: 1, x: 0, rotateY: 0, scale: 1, ease: 'power2.out', scrollTrigger: { trigger: '.story-assistant', start: 'top 70%', end: 'top 30%', scrub: 0.9 } })
    gsap.fromTo('.analytics-card', { autoAlpha: 0, y: 90, rotateX: 10, scale: 0.9 }, { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, ease: 'power2.out', scrollTrigger: { trigger: '.story-analytics', start: 'top 70%', end: 'top 30%', scrub: 0.9 } })
    gsap.fromTo('.final-panel', { scale: 0.88, borderRadius: '5rem' }, { scale: 1, borderRadius: '2.7rem', ease: 'power2.out', scrollTrigger: { trigger: '.story-final', start: 'top 88%', end: 'top 24%', scrub: 1 } })
  }, node)

  sections[0]?.classList.add('is-active')
  ScrollTrigger.refresh()
  return () => context.revert()
}
