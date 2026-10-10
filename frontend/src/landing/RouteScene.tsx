import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MutableRefObject, useMemo, useRef } from 'react'
import * as THREE from 'three'

type RouteSceneProps = {
  progress: MutableRefObject<number>
}

const ROUTE_POINTS = [
  new THREE.Vector3(-6.2, -1.4, 0),
  new THREE.Vector3(-3.4, 0.35, -0.8),
  new THREE.Vector3(-0.6, -0.15, 0.2),
  new THREE.Vector3(2.2, 1.25, -0.55),
  new THREE.Vector3(5.7, -0.45, 0.35),
]

function CameraRail({ progress }: RouteSceneProps) {
  const { camera, pointer } = useThree()
  const rail = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(5.2, 4.6, 9.8),
    new THREE.Vector3(2.5, 3.2, 8.3),
    new THREE.Vector3(-0.3, 4.1, 7.4),
    new THREE.Vector3(-2.8, 2.4, 7.8),
    new THREE.Vector3(0.5, 4.8, 9.4),
  ]), [])
  const target = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const t = THREE.MathUtils.clamp(progress.current, 0, 1)
    const destination = rail.getPointAt(t)
    destination.x += pointer.x * 0.35
    destination.y += pointer.y * 0.2
    camera.position.lerp(destination, 1 - Math.pow(0.001, delta))
    target.set(THREE.MathUtils.lerp(1.6, -0.4, t), THREE.MathUtils.lerp(0.25, 0.1, t), 0)
    camera.lookAt(target)
  })
  return null
}

function Station({ position, index }: { position: THREE.Vector3; index: number }) {
  const group = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (group.current) group.current.position.y = position.y + Math.sin(state.clock.elapsedTime * 0.7 + index) * 0.06
  })
  return <group ref={group} position={[position.x, position.y, position.z]}>
    <mesh receiveShadow castShadow>
      <cylinderGeometry args={[0.78, 0.92, 0.18, 32]} />
      <meshStandardMaterial color={index === 4 ? '#75b596' : '#e6eee8'} roughness={0.72} metalness={0.03} />
    </mesh>
    <mesh position={[0, 0.28, 0]} castShadow>
      <sphereGeometry args={[index === 4 ? 0.24 : 0.18, 24, 24]} />
      <meshStandardMaterial color={index < 3 ? '#397960' : '#75b596'} roughness={0.42} />
    </mesh>
    <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.4, 0.025, 12, 48]} />
      <meshBasicMaterial color="#a3b9aa" transparent opacity={0.65} />
    </mesh>
  </group>
}

function FloatingCard({ position, scale = 1, accent = false }: { position: [number, number, number]; scale?: number; accent?: boolean }) {
  return <group position={position} scale={scale} rotation={[0.04, -0.18, -0.035]}>
    <mesh castShadow>
      <boxGeometry args={[2.15, 1.2, 0.08]} />
      <meshPhysicalMaterial color="#ffffff" roughness={0.35} transmission={0.04} transparent opacity={0.92} />
    </mesh>
    <mesh position={[-0.76, 0.28, 0.052]}>
      <circleGeometry args={[0.16, 24]} />
      <meshBasicMaterial color={accent ? '#c69650' : '#75b596'} />
    </mesh>
    {[0.28, -0.02, -0.3].map((y, index) => <mesh key={y} position={[0.22, y, 0.052]}>
      <boxGeometry args={[index === 0 ? 1.25 : 1.58, index === 0 ? 0.11 : 0.06, 0.012]} />
      <meshBasicMaterial color={index === 0 ? '#26322d' : '#a3b9aa'} transparent opacity={index === 0 ? 0.8 : 0.48} />
    </mesh>)}
  </group>
}

function World({ progress }: RouteSceneProps) {
  const world = useRef<THREE.Group>(null)
  const route = useMemo(() => new THREE.CatmullRomCurve3(ROUTE_POINTS), [])

  useFrame((state, delta) => {
    if (!world.current) return
    const targetRotation = state.pointer.x * 0.045
    world.current.rotation.y = THREE.MathUtils.damp(world.current.rotation.y, targetRotation, 3, delta)
  })

  return <group ref={world} rotation={[-0.08, -0.08, 0]}>
    <mesh receiveShadow position={[0, -1.7, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[22, 14]} />
      <shadowMaterial transparent opacity={0.12} />
    </mesh>
    <mesh castShadow receiveShadow>
      <tubeGeometry args={[route, 180, 0.1, 16, false]} />
      <meshStandardMaterial color="#397960" roughness={0.58} metalness={0.04} />
    </mesh>
    {ROUTE_POINTS.map((point, index) => <Station key={index} position={point} index={index} />)}
    <FloatingCard position={[-3.35, 1.65, -0.25]} />
    <FloatingCard position={[0.25, 1.38, 0.42]} scale={0.88} accent />
    <FloatingCard position={[4.3, 1.25, 0.22]} scale={0.82} />
    {[-5.4, -4.7, 3.7, 4.8].map((x, index) => <group key={x} position={[x, -1.32 + (index % 2) * 0.32, -1.35]}>
      <mesh castShadow position={[0, 0.44, 0]}>
        <coneGeometry args={[0.34, 0.88, 10]} />
        <meshStandardMaterial color={index % 2 ? '#75b596' : '#a3b9aa'} roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.045, 0.055, 0.32, 8]} />
        <meshStandardMaterial color="#846e55" />
      </mesh>
    </group>)}
    <CameraRail progress={progress} />
  </group>
}

export default function RouteScene({ progress }: RouteSceneProps) {
  return <Canvas
    aria-hidden="true"
    dpr={[1, 1.5]}
    camera={{ position: [5.2, 4.6, 9.8], fov: 38, near: 0.1, far: 100 }}
    gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    shadows
  >
    <ambientLight intensity={1.55} color="#f6f8f5" />
    <directionalLight position={[4, 9, 7]} intensity={2.5} color="#fffdf8" castShadow shadow-mapSize={[1024, 1024]} />
    <directionalLight position={[-6, 3, 2]} intensity={0.85} color="#9fcab3" />
    <fog attach="fog" args={['#f6f8f5', 13, 24]} />
    <World progress={progress} />
  </Canvas>
}
