import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MutableRefObject, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

type RouteSceneProps = { progress: MutableRefObject<number> }
type Vec3 = [number, number, number]

const ROUTE_POINTS = [
  new THREE.Vector3(-7.2, -1.2, -0.8),
  new THREE.Vector3(-4.8, 0.15, -0.2),
  new THREE.Vector3(-2.35, -0.35, 0.55),
  new THREE.Vector3(0.15, 1.05, -0.25),
  new THREE.Vector3(2.9, 0.05, 0.8),
  new THREE.Vector3(5.7, 1.25, -0.4),
  new THREE.Vector3(8.2, -0.15, 0.35),
]

const clampPhase = (value: number, start: number, end: number) => {
  const normalized = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

function ReflectiveEnvironment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl)
    const environment = new RoomEnvironment()
    const texture = generator.fromScene(environment).texture
    scene.environment = texture
    return () => {
      scene.environment = null
      texture.dispose()
      environment.dispose()
      generator.dispose()
    }
  }, [gl, scene])
  return null
}

function CameraRig({ progress }: RouteSceneProps) {
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera)
  const pointer = useThree((state) => state.pointer)
  const cameraRail = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(7.8, 5.2, 11.8),
    new THREE.Vector3(4.8, 2.4, 7.2),
    new THREE.Vector3(0.5, 1.5, 5.6),
    new THREE.Vector3(-4.1, 2.05, 5.2),
    new THREE.Vector3(-0.8, 2.9, 6.5),
    new THREE.Vector3(3.9, 1.45, 5.3),
    new THREE.Vector3(1.2, 4.6, 8.4),
    new THREE.Vector3(0, 6.8, 12.8),
  ]), [])
  const targetRail = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.5, 0.15, 0),
    new THREE.Vector3(-2.8, 0.1, 0),
    new THREE.Vector3(-4.5, 0.2, 0),
    new THREE.Vector3(-1.2, 0.3, 0),
    new THREE.Vector3(1.1, 0.65, 0.1),
    new THREE.Vector3(3.3, 0.35, 0),
    new THREE.Vector3(0.8, 0.8, 0),
    new THREE.Vector3(0, 0.15, 0),
  ]), [])
  const desiredPosition = useMemo(() => new THREE.Vector3(), [])
  const desiredTarget = useMemo(() => new THREE.Vector3(), [])
  const smoothTarget = useMemo(() => new THREE.Vector3(1.5, 0.15, 0), [])

  useFrame((_, delta) => {
    const t = THREE.MathUtils.clamp(progress.current, 0, 1)
    cameraRail.getPointAt(t, desiredPosition)
    targetRail.getPointAt(t, desiredTarget)
    desiredPosition.x += pointer.x * 0.48
    desiredPosition.y += pointer.y * 0.28
    camera.position.lerp(desiredPosition, 1 - Math.pow(0.0008, delta))
    smoothTarget.lerp(desiredTarget, 1 - Math.pow(0.0015, delta))
    camera.lookAt(smoothTarget)
    const targetFov = 39 + Math.sin(t * Math.PI) * 7 - clampPhase(t, 0.88, 1) * 5
    camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 4, delta)
    camera.updateProjectionMatrix()
  })
  return null
}

function GlassPanel({ size, color = '#eaf3ee', opacity = 0.82 }: { size: Vec3; color?: string; opacity?: number }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 6, Math.min(size[0], size[1]) * 0.055), [size])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} castShadow receiveShadow>
    <meshPhysicalMaterial
      color={color}
      roughness={0.12}
      metalness={0.06}
      transmission={0.68}
      thickness={0.72}
      ior={1.42}
      transparent
      opacity={opacity}
      envMapIntensity={1.35}
      clearcoat={0.72}
      clearcoatRoughness={0.16}
    />
  </mesh>
}

function Station({ position, stationT, index, progress }: { position: Vec3; stationT: number; index: number; progress: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  useFrame((state, delta) => {
    if (!group.current) return
    const distance = Math.abs(progress.current - stationT)
    const active = THREE.MathUtils.clamp(1 - distance * 7.5, 0, 1)
    const pulse = Math.sin(state.clock.elapsedTime * 2.1 + index) * 0.025
    const targetScale = 1 + active * 0.25 + pulse
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, targetScale, 5, delta))
    group.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.62 + index) * 0.055
    if (core.current) core.current.emissiveIntensity = THREE.MathUtils.damp(core.current.emissiveIntensity, 0.22 + active * 2.4, 6, delta)
    if (ring.current) ring.current.rotation.z += delta * (0.2 + active * 0.8)
  })
  return <group ref={group} position={position}>
    <mesh receiveShadow castShadow>
      <cylinderGeometry args={[1.05, 1.28, 0.22, 48]} />
      <meshPhysicalMaterial color="#dbe8e0" roughness={0.28} metalness={0.12} clearcoat={0.8} envMapIntensity={1.4} />
    </mesh>
    <mesh position={[0, 0.2, 0]} receiveShadow>
      <cylinderGeometry args={[0.78, 0.92, 0.14, 48]} />
      <meshPhysicalMaterial color="#f8fbf9" roughness={0.18} transmission={0.18} clearcoat={0.9} />
    </mesh>
    <mesh ref={ring} position={[0, 0.44, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.46, 0.032, 16, 72]} />
      <meshStandardMaterial color="#8fd6b2" emissive="#5fb78d" emissiveIntensity={1.3} toneMapped={false} />
    </mesh>
    <mesh position={[0, 0.5, 0]} castShadow>
      <sphereGeometry args={[0.23, 32, 32]} />
      <meshStandardMaterial ref={core} color={index === 1 ? '#75b596' : '#d9f0e4'} emissive="#55b788" emissiveIntensity={0.3} roughness={0.18} metalness={0.08} />
    </mesh>
    <group position={[0, 1.25, -0.18]} rotation={[0.02, -0.08 + index * 0.05, 0]}>
      <GlassPanel size={[2.35, 1.05, 0.08]} opacity={0.72} />
      <mesh position={[-0.78, 0.18, 0.052]}><circleGeometry args={[0.14, 24]} /><meshBasicMaterial color={index === 1 ? '#75b596' : '#a3b9aa'} /></mesh>
      {[0.22, -0.04, -0.28].map((y, row) => <mesh key={y} position={[0.3, y, 0.052]}>
        <boxGeometry args={[row === 0 ? 1.12 : 1.52, row === 0 ? 0.1 : 0.045, 0.012]} />
        <meshBasicMaterial color={row === 0 ? '#26322d' : '#7f958a'} transparent opacity={row === 0 ? 0.82 : 0.55} />
      </mesh>)}
    </group>
  </group>
}

function SpatialCard({ start, scattered, aligned, accent, index, progress }: { start: Vec3; scattered: Vec3; aligned: Vec3; accent: string; index: number; progress: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const startV = useMemo(() => new THREE.Vector3(...start), [start])
  const scatteredV = useMemo(() => new THREE.Vector3(...scattered), [scattered])
  const alignedV = useMemo(() => new THREE.Vector3(...aligned), [aligned])
  const target = useMemo(() => new THREE.Vector3(), [])
  useFrame((state, delta) => {
    if (!group.current) return
    const t = progress.current
    const disperse = clampPhase(t, 0.1, 0.24) * (1 - clampPhase(t, 0.28, 0.42))
    const organize = clampPhase(t, 0.31, 0.47)
    target.copy(startV).lerp(scatteredV, disperse).lerp(alignedV, organize)
    target.y += Math.sin(state.clock.elapsedTime * 0.72 + index * 1.8) * 0.09
    group.current.position.lerp(target, 1 - Math.pow(0.0018, delta))
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, disperse * (index % 2 ? -0.68 : 0.62) + organize * -0.08, 4, delta)
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, disperse * (index - 1) * 0.16, 4, delta)
  })
  return <group ref={group} position={start}>
    <GlassPanel size={[2.35, 1.35, 0.1]} color="#f4faf6" opacity={0.86} />
    <mesh position={[-0.76, 0.32, 0.07]}><circleGeometry args={[0.18, 32]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.2} /></mesh>
    {[0.31, 0.02, -0.27, -0.47].map((y, row) => <mesh key={y} position={[0.28, y, 0.07]}>
      <boxGeometry args={[row === 0 ? 1.22 : row === 3 ? 0.76 : 1.58, row === 0 ? 0.11 : 0.047, 0.015]} />
      <meshBasicMaterial color={row === 0 ? '#26322d' : row === 3 ? accent : '#8fa198'} transparent opacity={row === 0 ? 0.85 : 0.55} />
    </mesh>)}
  </group>
}

function DashboardPanel({ progress }: RouteSceneProps) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!group.current) return
    const appear = clampPhase(progress.current, 0.42, 0.55) * (1 - clampPhase(progress.current, 0.67, 0.75) * 0.72)
    group.current.visible = appear > 0.012
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, 0.2 + appear * 0.8, 5, delta))
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, -2.5 + appear * 3.2, 5, delta)
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, -0.55 + appear * 0.42, 4, delta)
  })
  return <group ref={group} position={[0.4, -2.5, 1.25]} rotation={[0.04, -0.55, -0.025]} scale={0.2}>
    <GlassPanel size={[6.6, 3.9, 0.14]} color="#eef6f1" opacity={0.9} />
    <mesh position={[-2.55, 0, 0.1]}><boxGeometry args={[1.05, 3.55, 0.08]} /><meshStandardMaterial color="#183f33" roughness={0.28} metalness={0.08} /></mesh>
    {[1.3, 0.55, -0.2].map((y, index) => <mesh key={y} position={[-2.55, y, 0.16]}><boxGeometry args={[0.68, 0.09, 0.02]} /><meshBasicMaterial color={index === 0 ? '#ffffff' : '#9ab5a7'} transparent opacity={0.8} /></mesh>)}
    {[-1.35, 0, 1.35].map((x, index) => <group key={x} position={[x, 1.15, 0.13]}>
      <mesh><boxGeometry args={[1.12, 0.7, 0.08]} /><meshPhysicalMaterial color="#ffffff" roughness={0.2} transmission={0.18} /></mesh>
      <mesh position={[-0.34, 0.12, 0.05]}><boxGeometry args={[0.17, 0.17, 0.02]} /><meshBasicMaterial color={index === 1 ? '#c69650' : '#75b596'} /></mesh>
      <mesh position={[0.12, 0.12, 0.05]}><boxGeometry args={[0.48, 0.09, 0.02]} /><meshBasicMaterial color="#26322d" /></mesh>
      <mesh position={[0.04, -0.14, 0.05]}><boxGeometry args={[0.72, 0.04, 0.02]} /><meshBasicMaterial color="#91a49a" /></mesh>
    </group>)}
    {[0.42, -0.22, -0.86, -1.5].map((y, row) => <group key={y} position={[0.15, y, 0.13]}>
      <mesh><boxGeometry args={[4.65, 0.48, 0.055]} /><meshPhysicalMaterial color={row === 0 ? '#e3f1e9' : '#ffffff'} transparent opacity={0.78} roughness={0.35} /></mesh>
      <mesh position={[-1.85, 0, 0.04]}><circleGeometry args={[0.13, 20]} /><meshBasicMaterial color="#a3b9aa" /></mesh>
      <mesh position={[-1.2, 0.08, 0.04]}><boxGeometry args={[0.68, 0.07, 0.015]} /><meshBasicMaterial color="#26322d" /></mesh>
      <mesh position={[0.52, 0.03, 0.04]}><boxGeometry args={[1.18, 0.055, 0.015]} /><meshBasicMaterial color="#6f8479" /></mesh>
      <mesh position={[1.78, 0.03, 0.04]}><boxGeometry args={[0.48, 0.055, 0.015]} /><meshBasicMaterial color={row < 2 ? '#c56d63' : '#397960'} /></mesh>
    </group>)}
  </group>
}

function CallPanel({ progress }: RouteSceneProps) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!group.current) return
    const appear = clampPhase(progress.current, 0.59, 0.7) * (1 - clampPhase(progress.current, 0.8, 0.87) * 0.7)
    group.current.visible = appear > 0.012
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, 0.15 + appear * 0.85, 5, delta))
    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, 7.8 - appear * 3.2, 5, delta)
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, 0.75 - appear * 0.58, 4, delta)
  })
  return <group ref={group} position={[7.8, 0.55, 0.4]} rotation={[-0.02, 0.75, 0.025]} scale={0.15}>
    <GlassPanel size={[4.35, 4.15, 0.14]} color="#edf7f1" opacity={0.88} />
    <mesh position={[-1.48, 1.42, 0.13]}><circleGeometry args={[0.34, 32]} /><meshStandardMaterial color="#397960" emissive="#75b596" emissiveIntensity={0.45} /></mesh>
    <mesh position={[-0.18, 1.58, 0.13]}><boxGeometry args={[1.7, 0.12, 0.02]} /><meshBasicMaterial color="#26322d" /></mesh>
    <mesh position={[-0.38, 1.28, 0.13]}><boxGeometry args={[1.3, 0.055, 0.02]} /><meshBasicMaterial color="#82968a" /></mesh>
    <group position={[0, 0.05, 0.13]}>
      <mesh><boxGeometry args={[3.7, 2.25, 0.06]} /><meshPhysicalMaterial color="#f8fbf9" transmission={0.1} roughness={0.28} /></mesh>
      {[0.76, 0.45, 0.14, -0.3, -0.62].map((y, row) => <group key={y} position={[0, y, 0.05]}>
        {row > 1 && <mesh position={[-1.42, 0, 0]}><circleGeometry args={[0.065, 18]} /><meshBasicMaterial color="#75b596" /></mesh>}
        <mesh position={[row > 1 ? 0.08 : -0.1, 0, 0]}><boxGeometry args={[row === 0 ? 2.7 : row === 1 ? 3.05 : 2.55, row < 2 ? 0.065 : 0.045, 0.012]} /><meshBasicMaterial color={row === 0 ? '#26322d' : '#80948a'} /></mesh>
      </group>)}
    </group>
    <mesh position={[0, -1.55, 0.13]}><boxGeometry args={[3.68, 0.46, 0.06]} /><meshStandardMaterial color="#183f33" roughness={0.3} /></mesh>
  </group>
}

function AnalyticsCluster({ progress }: RouteSceneProps) {
  const group = useRef<THREE.Group>(null)
  const bars = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    if (!group.current) return
    const appear = clampPhase(progress.current, 0.74, 0.87)
    group.current.visible = appear > 0.012
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, 0.08 + appear * 0.92, 5, delta))
    group.current.position.z = THREE.MathUtils.damp(group.current.position.z, -4 + appear * 4.8, 5, delta)
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, -0.9 + appear * 0.72 + Math.sin(state.clock.elapsedTime * 0.25) * 0.025, 4, delta)
    if (bars.current) bars.current.scale.y = THREE.MathUtils.damp(bars.current.scale.y, 0.05 + appear * 0.95, 5, delta)
  })
  return <group ref={group} position={[-0.2, 0.5, -4]} rotation={[0.03, -0.9, 0]} scale={0.08}>
    <GlassPanel size={[6.25, 3.8, 0.14]} color="#edf7f1" opacity={0.88} />
    <mesh position={[-2.05, 1.35, 0.13]}><boxGeometry args={[1.35, 0.12, 0.02]} /><meshBasicMaterial color="#26322d" /></mesh>
    <group ref={bars} position={[-1.45, -1.15, 0.14]} scale={[1, 0.05, 1]}>
      {[0.65, 1.35, 0.95, 1.85, 1.2].map((height, index) => <mesh key={index} position={[index * 0.55, height / 2, 0]}>
        <boxGeometry args={[0.32, height, 0.13]} />
        <meshStandardMaterial color={index === 3 ? '#75b596' : '#397960'} emissive="#397960" emissiveIntensity={0.15 + index * 0.04} roughness={0.24} />
      </mesh>)}
    </group>
    <group position={[1.65, 0.25, 0.14]}>
      <mesh rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.78, 0.22, 30, 96, Math.PI * 1.55]} /><meshStandardMaterial color="#75b596" emissive="#397960" emissiveIntensity={0.25} roughness={0.22} /></mesh>
      <mesh rotation={[0, 0, -Math.PI * 0.45]}><torusGeometry args={[0.78, 0.22, 30, 96, Math.PI * 0.45]} /><meshStandardMaterial color="#c69650" roughness={0.28} /></mesh>
    </group>
    {[-2.1, -0.2, 1.7].map((x, index) => <group key={x} position={[x, 1.28, 0.14]}>
      <mesh><boxGeometry args={[1.5, 0.65, 0.055]} /><meshPhysicalMaterial color="#ffffff" transmission={0.18} roughness={0.24} /></mesh>
      <mesh position={[0, 0.12, 0.04]}><boxGeometry args={[0.62, 0.1, 0.014]} /><meshBasicMaterial color={index === 1 ? '#c69650' : '#26322d'} /></mesh>
      <mesh position={[0, -0.12, 0.04]}><boxGeometry args={[0.92, 0.045, 0.014]} /><meshBasicMaterial color="#8ca096" /></mesh>
    </group>)}
  </group>
}

function RouteMarker({ route, progress }: { route: THREE.CatmullRomCurve3; progress: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    if (!group.current) return
    const t = THREE.MathUtils.clamp(0.03 + progress.current * 0.94, 0, 1)
    route.getPointAt(t, point)
    point.y += 0.28
    group.current.position.copy(point)
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 4.2) * 0.12
    group.current.scale.setScalar(pulse)
  })
  return <group ref={group}>
    <pointLight color="#72d4a4" intensity={3.2} distance={3.5} decay={2} />
    <mesh><sphereGeometry args={[0.16, 28, 28]} /><meshBasicMaterial color="#b9ffda" toneMapped={false} /></mesh>
    <mesh><sphereGeometry args={[0.34, 24, 24]} /><meshBasicMaterial color="#64d49c" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
  </group>
}

function FinalNetwork({ progress }: RouteSceneProps) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshStandardMaterial>(null)
  const curves = useMemo(() => [
    new THREE.CatmullRomCurve3([new THREE.Vector3(-5, -1.4, -1), new THREE.Vector3(-1.5, 1.8, 0), new THREE.Vector3(4.8, 0.2, 1)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(-4.2, 1.5, 1.2), new THREE.Vector3(0, -0.6, -0.5), new THREE.Vector3(5.2, 1.7, -1)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(-2.7, -2, 0.4), new THREE.Vector3(1.3, 2.1, 1), new THREE.Vector3(4.2, -1.2, -0.3)]),
  ], [])
  useFrame((state, delta) => {
    if (!group.current) return
    const appear = clampPhase(progress.current, 0.88, 0.99)
    group.current.visible = appear > 0.012
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, 0.02 + appear * 0.98, 4, delta))
    group.current.rotation.y += delta * 0.035 * appear
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.18) * 0.035
    if (material.current) material.current.emissiveIntensity = 0.4 + appear * 2.2
  })
  return <group ref={group} position={[0, 0.1, -0.5]} scale={0.02}>
    {curves.map((curve, index) => <mesh key={index}>
      <tubeGeometry args={[curve, 100, 0.045 + index * 0.012, 12, false]} />
      <meshStandardMaterial ref={index === 0 ? material : undefined} color="#86d7ae" emissive="#4bc187" emissiveIntensity={1.6} toneMapped={false} transparent opacity={0.9} />
    </mesh>)}
    {[-4.5, -2.2, 0, 2.3, 4.6].map((x, index) => <mesh key={x} position={[x, Math.sin(index * 1.7) * 0.9, index % 2 ? 0.6 : -0.4]}>
      <sphereGeometry args={[0.16 + (index % 2) * 0.08, 24, 24]} />
      <meshBasicMaterial color="#b6f5d2" toneMapped={false} />
    </mesh>)}
  </group>
}

function World({ progress }: RouteSceneProps) {
  const world = useRef<THREE.Group>(null)
  const route = useMemo(() => new THREE.CatmullRomCurve3(ROUTE_POINTS), [])
  useFrame((state, delta) => {
    if (!world.current) return
    const t = progress.current
    const targetY = -0.1 + clampPhase(t, 0.12, 0.28) * 0.4 - clampPhase(t, 0.75, 0.92) * 0.25
    world.current.position.y = THREE.MathUtils.damp(world.current.position.y, targetY, 3, delta)
    world.current.rotation.y = THREE.MathUtils.damp(world.current.rotation.y, state.pointer.x * 0.052 + Math.sin(t * Math.PI * 2) * 0.035, 3, delta)
  })
  return <group ref={world} rotation={[-0.06, -0.05, 0]}>
    <mesh receiveShadow position={[0, -2.05, -0.55]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[28, 17]} />
      <shadowMaterial transparent opacity={0.11} />
    </mesh>
    <mesh castShadow receiveShadow>
      <tubeGeometry args={[route, 260, 0.09, 18, false]} />
      <meshStandardMaterial color="#397960" emissive="#286b50" emissiveIntensity={0.38} roughness={0.3} metalness={0.18} />
    </mesh>
    <mesh>
      <tubeGeometry args={[route, 260, 0.165, 16, false]} />
      <meshBasicMaterial color="#72d4a4" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    <Station position={[-4.8, 0.15, -0.2]} stationT={0.18} index={0} progress={progress} />
    <Station position={[0.15, 1.05, -0.25]} stationT={0.48} index={1} progress={progress} />
    <Station position={[5.7, 1.25, -0.4]} stationT={0.78} index={2} progress={progress} />
    <SpatialCard start={[-3.8, 2.4, 0.1]} scattered={[-7.4, 3.2, 1.6]} aligned={[-3.2, 2.2, 0.3]} accent="#c69650" index={0} progress={progress} />
    <SpatialCard start={[0.3, 2.8, 0.6]} scattered={[0.2, 4.8, -1.8]} aligned={[0.3, 2.75, 0.5]} accent="#75b596" index={1} progress={progress} />
    <SpatialCard start={[4.35, 2.65, 0.05]} scattered={[7.7, 3.8, 1.5]} aligned={[3.75, 2.55, 0.2]} accent="#c56d63" index={2} progress={progress} />
    <RouteMarker route={route} progress={progress} />
    <DashboardPanel progress={progress} />
    <CallPanel progress={progress} />
    <AnalyticsCluster progress={progress} />
    <FinalNetwork progress={progress} />
    <CameraRig progress={progress} />
  </group>
}

export default function RouteScene({ progress }: RouteSceneProps) {
  return <Canvas
    aria-hidden="true"
    dpr={[1, 1.35]}
    camera={{ position: [7.8, 5.2, 11.8], fov: 39, near: 0.1, far: 120 }}
    gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    shadows
  >
    <ReflectiveEnvironment />
    <ambientLight intensity={0.72} color="#e7f3ec" />
    <hemisphereLight args={['#f8fffb', '#173d31', 1.25]} />
    <directionalLight position={[6, 10, 8]} intensity={3.2} color="#fffef9" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.00025} />
    <directionalLight position={[-7, 4, 3]} intensity={1.15} color="#78c99f" />
    <pointLight position={[0, 5, 2]} intensity={1.8} color="#bdebd2" distance={16} />
    <fog attach="fog" args={['#f6f8f5', 14, 31]} />
    <World progress={progress} />
  </Canvas>
}
