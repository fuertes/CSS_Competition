import Link from 'next/link';

/**
 * Portada (landing) de la plataforma.
 *
 * Es un componente de servidor: no usa estado ni efectos, la interactividad es
 * puramente CSS (menú móvil con <details>, animaciones y *hover*). Mantiene
 * toda la identidad visual encapsulada en un bloque <style> con prefijo `lp-`
 * para no depender de la configuración de Tailwind ni ensuciar los estilos
 * globales, y respeta `prefers-reduced-motion`.
 */

const NAV_LINKS = [
	{ href: '#modos', label: 'Modos de juego' },
	{ href: '#capacidades', label: 'Capacidades' },
	{ href: '#como-funciona', label: 'Cómo funciona' },
	{ href: '/oca', label: 'La Oca', badge: 'Nuevo' },
];

interface Feature {
	title: string;
	description: string;
	icon: 'bolt' | 'gauge' | 'layers' | 'shield' | 'trophy' | 'code';
}

const FEATURES: Feature[] = [
	{
		icon: 'trophy',
		title: 'Ranking en directo',
		description:
			'Clasificación pública que se refresca sola. Los empates se resuelven por antigüedad del marcador, sin sorpresas.',
	},
	{
		icon: 'code',
		title: 'Corrección CSS por propiedades',
		description:
			'Se evalúa regla a regla y propiedad a propiedad, con crédito parcial: cada acierto suma, aunque el ejercicio no esté terminado.',
	},
	{
		icon: 'gauge',
		title: 'Competición con estrategia',
		description:
			'Penalizaciones configurables, bonificación por velocidad y marcadores aislados por ronda: cada competición empieza de cero.',
	},
	{
		icon: 'bolt',
		title: 'Puntuación atómica',
		description:
			'Los puntos se conceden en el servidor, dentro de transacciones. Los envíos simultáneos o repetidos nunca duplican resultados.',
	},
	{
		icon: 'layers',
		title: 'Panel docente completo',
		description:
			'Grupos, alumnos, asignaciones, ejercicios, códigos secretos y mantenimiento, con protección por sesión de administrador.',
	},
	{
		icon: 'shield',
		title: 'Seguridad por diseño',
		description:
			'Sesiones con tokens hasheados, códigos cifrados, defensa CSRF y validación en el servidor. Los secretos nunca llegan al navegador.',
	},
];

const MODES = [
	{
		tag: 'Modo 1',
		title: 'Códigos secretos',
		description:
			'Cada ejercicio esconde un código que solo conoce el profesorado. El grupo que lo introduce primero suma al instante.',
		href: '/alumnos',
		cta: 'Zona de alumnos',
		tone: 'lp-tone-violet',
	},
	{
		tag: 'Modo 2',
		title: 'CSS Competition',
		description:
			'Corrección de CSS en equipo, propiedad a propiedad, con crédito parcial y penalizaciones. El corazón de la competición.',
		href: '/competicion',
		cta: 'Entrar a la competición',
		tone: 'lp-tone-cyan',
	},
	{
		tag: 'Nuevo',
		title: 'La Oca del Caos',
		description:
			'Un modo de juego por turnos que reutiliza tus grupos y sesiones. Su base de datos está en preparación.',
		href: '/oca',
		cta: 'Descubrir La Oca',
		tone: 'lp-tone-pink',
	},
];

const STEPS = [
	{
		title: 'Prepara los equipos',
		text: 'Crea grupos, asigna alumnos y genera códigos de acceso. Cada asignación confirmada queda bloqueada.',
	},
	{
		title: 'Publica el reto',
		text: 'Importa el CSS de referencia o define el código de cada ejercicio. La ronda define el reto y la puntuación.',
	},
	{
		title: 'El aula compite',
		text: 'Los grupos entran con su código, entregan sus propuestas y reciben puntos o penalizaciones al momento.',
	},
	{
		title: 'Sigue la clasificación',
		text: 'El ranking en vivo muestra quién va en cabeza y se actualiza para todos sin recargar la página.',
	},
];

const METRICS = [
	{ value: '3', label: 'modos de juego', detail: 'Códigos, CSS y La Oca' },
	{ value: '100', label: 'puntos por ejercicio', detail: 'configurable por reto' },
	{ value: '10', label: 'puntos por propiedad', detail: 'crédito parcial en CSS' },
	{ value: '0', label: 'datos simulados', detail: 'PostgreSQL es la fuente de verdad' },
];

const RANKING = [
	{ pos: 1, name: 'Los Selectores', points: 1450, width: 100, tone: 'lp-rank-gold' },
	{ pos: 2, name: 'Píxeles de Acero', points: 1310, width: 90, tone: 'lp-rank-silver' },
	{ pos: 3, name: 'Margin Auto', points: 1180, width: 81, tone: 'lp-rank-bronze' },
	{ pos: 4, name: 'Flexbox Kids', points: 940, width: 65, tone: 'lp-rank-plain' },
	{ pos: 5, name: 'Grid Masters', points: 870, width: 60, tone: 'lp-rank-plain' },
];

function Icon({ name }: { name: Feature['icon'] }) {
	const common = {
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 1.7,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		className: 'lp-icon',
	};
	if (name === 'trophy')
		return (
			<svg {...common}>
				<path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4Z" />
				<path d="M6 6H4a2 2 0 0 0 2 4M18 6h2a2 2 0 0 1-2 4" />
			</svg>
		);
	if (name === 'code')
		return (
			<svg {...common}>
				<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14" />
			</svg>
		);
	if (name === 'gauge')
		return (
			<svg {...common}>
				<path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
				<path d="m13.4 12.6 4.1-4.1M3 20a9 9 0 1 1 18 0" />
			</svg>
		);
	if (name === 'bolt')
		return (
			<svg {...common}>
				<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
			</svg>
		);
	if (name === 'layers')
		return (
			<svg {...common}>
				<path d="m12 2 9 5-9 5-9-5 9-5Z" />
				<path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
			</svg>
		);
	return (
		<svg {...common}>
			<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3Z" />
			<path d="m9 12 2 2 4-4" />
		</svg>
	);
}

export default function EnterpriseLanding({
	competitionName,
	configured,
}: {
	competitionName: string;
	configured: boolean;
}) {
	return (
		<div className="lp-root">
			<style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />

			<div className="lp-orb lp-orb-a" aria-hidden="true" />
			<div className="lp-orb lp-orb-b" aria-hidden="true" />
			<div className="lp-orb lp-orb-c" aria-hidden="true" />

			<a href="#contenido" className="lp-skip">
				Saltar al contenido
			</a>

			<header className="lp-nav">
				<div className="lp-wrap lp-nav-inner">
					<Link href="/" className="lp-brand" prefetch={false}>
						<span className="lp-brand-mark" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
								<path d="M6 6H4a2 2 0 0 0 2 4M18 6h2a2 2 0 0 1-2 4" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</span>
						<span className="lp-brand-text">
							<span className="lp-brand-kicker">Plataforma</span>
							<span className="lp-brand-name">{competitionName}</span>
						</span>
					</Link>

					<nav className="lp-nav-links" aria-label="Navegación principal">
						{NAV_LINKS.map((link) => (
							<Link key={link.href} href={link.href} prefetch={false}>
								{link.label}
								{link.badge ? <span className="lp-nav-badge">{link.badge}</span> : null}
							</Link>
						))}
					</nav>

					<div className="lp-nav-actions">
						<Link href="/ranking" prefetch={false} className="lp-btn lp-btn-ghost lp-btn-sm">
							Ver ranking
						</Link>
						<Link href="/admin" prefetch={false} className="lp-btn lp-btn-primary lp-btn-sm">
							Panel docente
						</Link>
					</div>

					<details className="lp-menu">
						<summary aria-label="Abrir menú">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
							</svg>
						</summary>
						<div className="lp-menu-panel">
							{NAV_LINKS.map((link) => (
								<Link key={link.href} href={link.href} prefetch={false}>
									{link.label}
								</Link>
							))}
							<Link href="/ranking" prefetch={false}>
								Ver ranking
							</Link>
							<Link href="/admin" prefetch={false}>
								Panel docente
							</Link>
						</div>
					</details>
				</div>
			</header>

			<main id="contenido">
				{/* ---------------------------------------------------------------- Hero */}
				<section className="lp-hero">
					<div className="lp-wrap">
						<p className="lp-pill lp-up" style={{ animationDelay: '40ms' }}>
							<span className="lp-live" aria-hidden="true" />
							Competición por equipos en tiempo real
						</p>

						<h1 className="lp-title lp-up" style={{ animationDelay: '120ms' }}>
							Convierte el aula en una
							<br />
							<span className="lp-gradient">competición imparable</span>
						</h1>

						<p className="lp-lede lp-up" style={{ animationDelay: '200ms' }}>
							<strong>{competitionName}</strong> reúne códigos secretos, corrección de CSS por
							equipos y una clasificación en vivo en una sola plataforma, preparada para el ritmo
							de una clase real.
						</p>

						<div className="lp-cta lp-up" style={{ animationDelay: '280ms' }}>
							<Link href="/ranking" prefetch={false} className="lp-btn lp-btn-primary lp-btn-lg">
								Ver la clasificación
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="lp-arrow">
									<path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							</Link>
							<Link href="/alumnos" prefetch={false} className="lp-btn lp-btn-ghost lp-btn-lg">
								Entrar como alumno
							</Link>
						</div>

						{!configured ? (
							<p className="lp-notice lp-up" style={{ animationDelay: '360ms' }}>
								<span aria-hidden="true">⚠️</span>
								La base de datos todavía no está conectada.{' '}
								<Link href="/admin" prefetch={false}>
									Ver instrucciones de configuración
								</Link>
							</p>
						) : null}
					</div>

					<div className="lp-wrap">
						<div className="lp-window lp-up" style={{ animationDelay: '420ms' }}>
							<div className="lp-window-bar">
								<span className="lp-dot lp-dot-red" />
								<span className="lp-dot lp-dot-amber" />
								<span className="lp-dot lp-dot-green" />
								<span className="lp-window-title">clasificacion · en vivo</span>
								<span className="lp-window-live">
									<span className="lp-live" aria-hidden="true" />
									LIVE
								</span>
							</div>

							<div className="lp-window-body">
								<aside className="lp-side">
									<p className="lp-side-label">Competición</p>
									<span className="lp-side-item lp-side-active">Ranking</span>
									<span className="lp-side-item">Grupos</span>
									<span className="lp-side-item">Ejercicios</span>
									<span className="lp-side-item">Rondas</span>
									<p className="lp-side-label">Módulos</p>
									<span className="lp-side-item">CSS por equipos</span>
									<span className="lp-side-item">La Oca del Caos</span>
								</aside>

								<div className="lp-board">
									<div className="lp-board-head">
										<div>
											<p className="lp-board-kicker">Clasificación general</p>
											<p className="lp-board-meta">Ronda 3 · actualizada hace unos segundos</p>
										</div>
										<span className="lp-board-chip">En directo</span>
									</div>

									<ul className="lp-rows">
										{RANKING.map((row, index) => (
											<li key={row.name} className="lp-row" style={{ animationDelay: `${500 + index * 90}ms` }}>
												<span className={`lp-pos ${row.tone}`}>{row.pos}</span>
												<span className="lp-row-name">{row.name}</span>
												<span className="lp-track">
													<span
														className="lp-fill"
														style={{ width: `${row.width}%`, animationDelay: `${620 + index * 90}ms` }}
													/>
												</span>
												<span className="lp-points">{row.points}</span>
											</li>
										))}
									</ul>
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* ------------------------------------------------------------- Métricas */}
				<section className="lp-metrics lp-wrap">
					{METRICS.map((metric, index) => (
						<div key={metric.label} className="lp-metric lp-up" style={{ animationDelay: `${80 + index * 80}ms` }}>
							<span className="lp-metric-value">{metric.value}</span>
							<span className="lp-metric-label">{metric.label}</span>
							<span className="lp-metric-detail">{metric.detail}</span>
						</div>
					))}
				</section>

				{/* ---------------------------------------------------------------- Modos */}
				<section id="modos" className="lp-section lp-wrap">
					<p className="lp-eyebrow">Tres modos de juego</p>
					<h2 className="lp-h2">Una plataforma, muchas formas de competir</h2>
					<p className="lp-sub">
						Elige el reto de cada jornada. Todo comparte los mismos equipos, la misma sesión y el
						mismo ranking, sin duplicar datos.
					</p>

					<div className="lp-modes">
						{MODES.map((mode) => (
							<article key={mode.title} className={`lp-mode ${mode.tone}`}>
								<span className="lp-mode-tag">{mode.tag}</span>
								<h3 className="lp-mode-title">{mode.title}</h3>
								<p className="lp-mode-text">{mode.description}</p>
								<Link href={mode.href} prefetch={false} className="lp-mode-link">
									{mode.cta}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="lp-arrow">
										<path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								</Link>
							</article>
						))}
					</div>
				</section>

				{/* ---------------------------------------------------------- Capacidades */}
				<section id="capacidades" className="lp-section lp-wrap">
					<p className="lp-eyebrow">Capacidades</p>
					<h2 className="lp-h2">Pensada para el aula, construida como un producto serio</h2>
					<p className="lp-sub">
						Reglas de negocio en el servidor, integridad de datos por encima de todo y una
						experiencia clara para profesorado y alumnado.
					</p>

					<div className="lp-grid">
						{FEATURES.map((feature) => (
							<article key={feature.title} className="lp-card">
								<span className="lp-card-icon">
									<Icon name={feature.icon} />
								</span>
								<h3 className="lp-card-title">{feature.title}</h3>
								<p className="lp-card-text">{feature.description}</p>
							</article>
						))}
					</div>
				</section>

				{/* --------------------------------------------------------- Cómo funciona */}
				<section id="como-funciona" className="lp-section lp-wrap">
					<p className="lp-eyebrow">Cómo funciona</p>
					<h2 className="lp-h2">De cero a la primera ronda en cuatro pasos</h2>

					<ol className="lp-steps">
						{STEPS.map((step, index) => (
							<li key={step.title} className="lp-step">
								<span className="lp-step-num">{String(index + 1).padStart(2, '0')}</span>
								<h3 className="lp-step-title">{step.title}</h3>
								<p className="lp-step-text">{step.text}</p>
							</li>
						))}
					</ol>
				</section>

				{/* ----------------------------------------------------------------- CTA */}
				<section className="lp-wrap lp-final">
					<div className="lp-final-panel">
						<div className="lp-final-glow" aria-hidden="true" />
						<p className="lp-eyebrow">Empieza hoy</p>
						<h2 className="lp-final-title">¿Listo para que tu clase compita?</h2>
						<p className="lp-sub lp-final-sub">
							Entra en el panel, crea los equipos y lanza la primera ronda. El ranking se encarga
							del resto.
						</p>
						<div className="lp-cta lp-cta-center">
							<Link href="/admin" prefetch={false} className="lp-btn lp-btn-primary lp-btn-lg">
								Abrir el panel docente
							</Link>
							<Link href="/competicion/entrar" prefetch={false} className="lp-btn lp-btn-ghost lp-btn-lg">
								Entrar con un grupo
							</Link>
						</div>
					</div>
				</section>
			</main>

			<footer className="lp-footer">
				<div className="lp-wrap lp-footer-inner">
					<div className="lp-footer-brand">
						<span className="lp-brand-mark lp-brand-mark-sm" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
								<path d="M6 6H4a2 2 0 0 0 2 4M18 6h2a2 2 0 0 1-2 4" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</span>
						<div>
							<p className="lp-footer-name">{competitionName}</p>
							<p className="lp-footer-note">Plataforma educativa de competición por equipos.</p>
						</div>
					</div>

					<nav className="lp-footer-links" aria-label="Enlaces del pie">
						<Link href="/ranking" prefetch={false}>Ranking</Link>
						<Link href="/alumnos" prefetch={false}>Alumnos</Link>
						<Link href="/competicion" prefetch={false}>Competición</Link>
						<Link href="/oca" prefetch={false}>La Oca</Link>
						<Link href="/admin" prefetch={false}>Panel</Link>
					</nav>
				</div>
				<div className="lp-wrap lp-footer-legal">
					<span>Hecho para el aula · PostgreSQL como fuente de verdad</span>
					<span className="lp-footer-dot" aria-hidden="true">•</span>
					<span>Sin datos simulados</span>
				</div>
			</footer>
		</div>
	);
}

const LANDING_CSS = `
.lp-root {
	--lp-bg: #05060e;
	--lp-text: #eef0ff;
	--lp-muted: #9aa2c4;
	--lp-line: rgba(255, 255, 255, 0.10);
	--lp-card: rgba(255, 255, 255, 0.035);
	--lp-violet: #7c6cff;
	--lp-cyan: #22d3ee;
	--lp-pink: #f472b6;
	position: relative;
	isolation: isolate;
	overflow-x: clip;
	min-height: 100dvh;
	color: var(--lp-text);
	font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
	background:
		radial-gradient(1200px 620px at 12% -12%, rgba(124, 108, 255, 0.30), transparent 60%),
		radial-gradient(1000px 520px at 100% 0%, rgba(34, 211, 238, 0.20), transparent 55%),
		radial-gradient(900px 620px at 50% 118%, rgba(244, 114, 182, 0.16), transparent 62%),
		linear-gradient(180deg, #05060e 0%, #070818 52%, #05060e 100%);
}
.lp-root::before {
	content: "";
	position: absolute;
	inset: 0;
	z-index: -1;
	pointer-events: none;
	background-image:
		linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
		linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
	background-size: 62px 62px;
	-webkit-mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 10%, transparent 72%);
	mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 10%, transparent 72%);
	opacity: 0.55;
}
.lp-wrap {
	width: 100%;
	max-width: 1180px;
	margin: 0 auto;
	padding: 0 24px;
}

/* Orbes de fondo --------------------------------------------------- */
.lp-orb {
	position: absolute;
	z-index: -1;
	border-radius: 50%;
	filter: blur(70px);
	opacity: 0.55;
	pointer-events: none;
}
.lp-orb-a {
	width: 480px;
	height: 480px;
	top: -140px;
	left: -120px;
	background: radial-gradient(circle, rgba(124, 108, 255, 0.7), transparent 70%);
	animation: lp-float 16s ease-in-out infinite;
}
.lp-orb-b {
	width: 420px;
	height: 420px;
	top: 60px;
	right: -140px;
	background: radial-gradient(circle, rgba(34, 211, 238, 0.6), transparent 70%);
	animation: lp-float 20s ease-in-out infinite reverse;
}
.lp-orb-c {
	width: 520px;
	height: 520px;
	bottom: 4%;
	left: 40%;
	background: radial-gradient(circle, rgba(244, 114, 182, 0.4), transparent 70%);
	animation: lp-float 24s ease-in-out infinite;
}

/* Enlace de salto -------------------------------------------------- */
.lp-skip {
	position: absolute;
	left: -9999px;
	top: 0;
	z-index: 100;
}
.lp-skip:focus {
	left: 16px;
	top: 12px;
	padding: 10px 16px;
	border-radius: 10px;
	background: var(--lp-violet);
	color: #05060e;
	font-size: 14px;
	font-weight: 600;
}

/* Navegación ------------------------------------------------------- */
.lp-nav {
	position: sticky;
	top: 0;
	z-index: 40;
	border-bottom: 1px solid var(--lp-line);
	background: rgba(6, 7, 18, 0.72);
	-webkit-backdrop-filter: blur(16px) saturate(140%);
	backdrop-filter: blur(16px) saturate(140%);
}
.lp-nav-inner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 18px;
	height: 70px;
}
.lp-brand {
	display: flex;
	align-items: center;
	gap: 12px;
	text-decoration: none;
	color: var(--lp-text);
}
.lp-brand-mark {
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	border-radius: 13px;
	color: #06070f;
	background: linear-gradient(135deg, var(--lp-violet), var(--lp-cyan));
	box-shadow: 0 10px 26px -12px rgba(124, 108, 255, 0.9);
}
.lp-brand-mark svg {
	width: 21px;
	height: 21px;
}
.lp-brand-mark-sm {
	width: 34px;
	height: 34px;
	border-radius: 11px;
}
.lp-brand-mark-sm svg {
	width: 18px;
	height: 18px;
}
.lp-brand-text {
	display: flex;
	flex-direction: column;
	line-height: 1.15;
}
.lp-brand-kicker {
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--lp-cyan);
}
.lp-brand-name {
	font-size: 14px;
	font-weight: 650;
	max-width: 230px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.lp-nav-links {
	display: flex;
	align-items: center;
	gap: 4px;
}
.lp-nav-links a {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	padding: 9px 13px;
	border-radius: 10px;
	font-size: 14px;
	font-weight: 500;
	color: var(--lp-muted);
	text-decoration: none;
	transition: color 0.2s ease, background 0.2s ease;
}
.lp-nav-links a:hover {
	color: var(--lp-text);
	background: rgba(255, 255, 255, 0.06);
}
.lp-nav-badge {
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.04em;
	padding: 2px 7px;
	border-radius: 999px;
	color: #06070f;
	background: linear-gradient(135deg, var(--lp-pink), var(--lp-violet));
}
.lp-nav-actions {
	display: flex;
	align-items: center;
	gap: 10px;
}

/* Botones ---------------------------------------------------------- */
.lp-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 9px;
	border-radius: 12px;
	border: 1px solid transparent;
	padding: 12px 20px;
	font-size: 14px;
	font-weight: 650;
	text-decoration: none;
	cursor: pointer;
	transition: transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease,
		border-color 0.25s ease;
}
.lp-btn-sm {
	padding: 9px 15px;
	font-size: 13px;
}
.lp-btn-lg {
	padding: 14px 26px;
	font-size: 15px;
}
.lp-btn-primary {
	color: #05060e;
	background: linear-gradient(135deg, var(--lp-violet), var(--lp-cyan));
	box-shadow: 0 16px 40px -16px rgba(124, 108, 255, 0.9);
}
.lp-btn-primary:hover {
	transform: translateY(-2px);
	box-shadow: 0 24px 52px -16px rgba(34, 211, 238, 0.8);
}
.lp-btn-ghost {
	color: var(--lp-text);
	background: rgba(255, 255, 255, 0.04);
	border-color: var(--lp-line);
}
.lp-btn-ghost:hover {
	transform: translateY(-2px);
	background: rgba(255, 255, 255, 0.09);
	border-color: rgba(255, 255, 255, 0.24);
}
.lp-arrow {
	width: 18px;
	height: 18px;
	transition: transform 0.25s ease;
}
.lp-btn:hover .lp-arrow,
.lp-mode-link:hover .lp-arrow {
	transform: translateX(3px);
}

/* Menú móvil ------------------------------------------------------- */
.lp-menu {
	display: none;
	position: relative;
}
.lp-menu summary {
	display: grid;
	place-items: center;
	width: 42px;
	height: 42px;
	border-radius: 12px;
	border: 1px solid var(--lp-line);
	background: rgba(255, 255, 255, 0.05);
	color: var(--lp-text);
	cursor: pointer;
	list-style: none;
}
.lp-menu summary::-webkit-details-marker {
	display: none;
}
.lp-menu summary svg {
	width: 20px;
	height: 20px;
}
.lp-menu-panel {
	position: absolute;
	right: 0;
	top: calc(100% + 10px);
	display: flex;
	flex-direction: column;
	min-width: 230px;
	padding: 8px;
	border-radius: 16px;
	border: 1px solid var(--lp-line);
	background: rgba(10, 12, 27, 0.98);
	box-shadow: 0 30px 70px -24px rgba(0, 0, 0, 0.9);
}
.lp-menu-panel a {
	padding: 11px 13px;
	border-radius: 10px;
	font-size: 14px;
	font-weight: 500;
	color: var(--lp-text);
	text-decoration: none;
}
.lp-menu-panel a:hover {
	background: rgba(255, 255, 255, 0.07);
}

/* Hero ------------------------------------------------------------- */
.lp-hero {
	padding: 96px 0 72px;
	text-align: center;
}
.lp-pill {
	display: inline-flex;
	align-items: center;
	gap: 9px;
	padding: 8px 16px;
	border-radius: 999px;
	border: 1px solid var(--lp-line);
	background: rgba(255, 255, 255, 0.045);
	font-size: 13px;
	font-weight: 550;
	color: #cfd4ee;
}
.lp-live {
	position: relative;
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #34d399;
	box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.6);
	animation: lp-pulse 2s infinite;
}
.lp-title {
	margin: 26px 0 0;
	font-size: clamp(2.4rem, 6vw, 4.4rem);
	line-height: 1.04;
	letter-spacing: -0.03em;
	font-weight: 800;
}
.lp-gradient {
	background: linear-gradient(100deg, #a78bfa 0%, #22d3ee 45%, #f472b6 100%);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	background-size: 220% auto;
	animation: lp-shimmer 6s linear infinite;
}
.lp-lede {
	max-width: 680px;
	margin: 22px auto 0;
	font-size: clamp(1rem, 2.2vw, 1.18rem);
	line-height: 1.65;
	color: var(--lp-muted);
}
.lp-lede strong {
	color: var(--lp-text);
	font-weight: 650;
}
.lp-cta {
	display: flex;
	flex-wrap: wrap;
	gap: 14px;
	justify-content: center;
	margin-top: 32px;
}
.lp-cta-center {
	justify-content: center;
}
.lp-notice {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin-top: 24px;
	padding: 11px 16px;
	border-radius: 12px;
	border: 1px solid rgba(251, 191, 36, 0.35);
	background: rgba(251, 191, 36, 0.10);
	font-size: 13.5px;
	color: #fcd34d;
}
.lp-notice a {
	color: #fde68a;
	font-weight: 600;
}

/* Ventana / mockup ------------------------------------------------- */
.lp-window {
	margin-top: 62px;
	border-radius: 22px;
	border: 1px solid var(--lp-line);
	overflow: hidden;
	background: linear-gradient(180deg, rgba(16, 18, 38, 0.92), rgba(7, 8, 20, 0.94));
	box-shadow:
		0 60px 140px -40px rgba(0, 0, 0, 0.95),
		0 0 0 1px rgba(255, 255, 255, 0.04) inset;
	text-align: left;
}
.lp-window-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 13px 18px;
	border-bottom: 1px solid var(--lp-line);
	background: rgba(255, 255, 255, 0.025);
}
.lp-dot {
	width: 11px;
	height: 11px;
	border-radius: 50%;
}
.lp-dot-red { background: #ff5f57; }
.lp-dot-amber { background: #febc2e; }
.lp-dot-green { background: #28c840; }
.lp-window-title {
	margin-left: 10px;
	font-family: var(--font-mono, ui-monospace, monospace);
	font-size: 12px;
	color: var(--lp-muted);
}
.lp-window-live {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	margin-left: auto;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.1em;
	color: #34d399;
}
.lp-window-body {
	display: grid;
	grid-template-columns: 218px 1fr;
}
.lp-side {
	padding: 20px 14px;
	border-right: 1px solid var(--lp-line);
	background: rgba(255, 255, 255, 0.015);
}
.lp-side-label {
	margin: 0 0 8px;
	padding: 0 10px;
	font-size: 10.5px;
	font-weight: 700;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: #6c74a0;
}
.lp-side-label:not(:first-child) {
	margin-top: 20px;
}
.lp-side-item {
	display: block;
	padding: 9px 11px;
	border-radius: 9px;
	font-size: 13px;
	color: var(--lp-muted);
}
.lp-side-active {
	color: var(--lp-text);
	background: linear-gradient(90deg, rgba(124, 108, 255, 0.28), rgba(34, 211, 238, 0.12));
	box-shadow: inset 0 0 0 1px rgba(124, 108, 255, 0.35);
}
.lp-board {
	padding: 22px 24px 26px;
}
.lp-board-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 18px;
}
.lp-board-kicker {
	margin: 0;
	font-size: 15px;
	font-weight: 650;
	color: var(--lp-text);
}
.lp-board-meta {
	margin: 4px 0 0;
	font-size: 12px;
	color: var(--lp-muted);
}
.lp-board-chip {
	flex: none;
	font-size: 11px;
	font-weight: 700;
	padding: 6px 11px;
	border-radius: 999px;
	color: #34d399;
	border: 1px solid rgba(52, 211, 153, 0.35);
	background: rgba(52, 211, 153, 0.10);
}
.lp-rows {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.lp-row {
	display: grid;
	grid-template-columns: 34px minmax(110px, 160px) 1fr 66px;
	align-items: center;
	gap: 14px;
	animation: lp-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.lp-pos {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 9px;
	font-size: 13px;
	font-weight: 750;
	color: #05060e;
	background: rgba(255, 255, 255, 0.14);
}
.lp-rank-gold { background: linear-gradient(135deg, #fcd34d, #f59e0b); }
.lp-rank-silver { background: linear-gradient(135deg, #e2e8f0, #94a3b8); }
.lp-rank-bronze { background: linear-gradient(135deg, #f0a868, #cd7f32); }
.lp-rank-plain { color: var(--lp-text); }
.lp-row-name {
	font-size: 13.5px;
	font-weight: 550;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.lp-track {
	height: 10px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.06);
	overflow: hidden;
}
.lp-fill {
	display: block;
	height: 100%;
	border-radius: 999px;
	transform-origin: left center;
	background: linear-gradient(90deg, var(--lp-violet), var(--lp-cyan));
	animation: lp-grow 1s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.lp-points {
	font-family: var(--font-mono, ui-monospace, monospace);
	font-size: 13px;
	font-weight: 650;
	text-align: right;
	color: #d7dbff;
}

/* Métricas --------------------------------------------------------- */
.lp-metrics {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 20px;
	padding-top: 8px;
	padding-bottom: 8px;
}
.lp-metric {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 24px;
	border-radius: 18px;
	border: 1px solid var(--lp-line);
	background: var(--lp-card);
}
.lp-metric-value {
	font-size: 2.4rem;
	font-weight: 800;
	line-height: 1;
	background: linear-gradient(135deg, #a78bfa, #22d3ee);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}
.lp-metric-label {
	margin-top: 6px;
	font-size: 14px;
	font-weight: 600;
	color: var(--lp-text);
}
.lp-metric-detail {
	font-size: 12.5px;
	color: var(--lp-muted);
}

/* Secciones -------------------------------------------------------- */
.lp-section {
	padding: 92px 24px 0;
}
.lp-eyebrow {
	margin: 0;
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.16em;
	text-transform: uppercase;
	color: var(--lp-cyan);
}
.lp-h2 {
	margin: 12px 0 0;
	font-size: clamp(1.7rem, 3.6vw, 2.6rem);
	font-weight: 780;
	letter-spacing: -0.02em;
	max-width: 780px;
}
.lp-sub {
	margin: 16px 0 0;
	max-width: 640px;
	font-size: 15.5px;
	line-height: 1.65;
	color: var(--lp-muted);
}

/* Modos ------------------------------------------------------------ */
.lp-modes {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 20px;
	margin-top: 40px;
}
.lp-mode {
	position: relative;
	display: flex;
	flex-direction: column;
	padding: 28px;
	border-radius: 20px;
	border: 1px solid var(--lp-line);
	background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015));
	overflow: hidden;
	transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
.lp-mode::after {
	content: "";
	position: absolute;
	inset: 0 0 auto 0;
	height: 3px;
	background: var(--lp-mode-accent, var(--lp-violet));
}
.lp-tone-violet { --lp-mode-accent: linear-gradient(90deg, #7c6cff, #22d3ee); }
.lp-tone-cyan { --lp-mode-accent: linear-gradient(90deg, #22d3ee, #34d399); }
.lp-tone-pink { --lp-mode-accent: linear-gradient(90deg, #f472b6, #7c6cff); }
.lp-mode:hover {
	transform: translateY(-5px);
	border-color: rgba(124, 108, 255, 0.5);
	box-shadow: 0 34px 70px -40px rgba(124, 108, 255, 0.85);
}
.lp-mode-tag {
	align-self: flex-start;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	padding: 5px 11px;
	border-radius: 999px;
	color: #cfd4ee;
	border: 1px solid var(--lp-line);
	background: rgba(255, 255, 255, 0.05);
}
.lp-mode-title {
	margin: 18px 0 0;
	font-size: 1.32rem;
	font-weight: 700;
}
.lp-mode-text {
	margin: 12px 0 0;
	font-size: 14px;
	line-height: 1.65;
	color: var(--lp-muted);
	flex: 1;
}
.lp-mode-link {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin-top: 22px;
	font-size: 14px;
	font-weight: 650;
	color: var(--lp-cyan);
	text-decoration: none;
}

/* Capacidades ------------------------------------------------------ */
.lp-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 20px;
	margin-top: 40px;
}
.lp-card {
	padding: 26px;
	border-radius: 18px;
	border: 1px solid var(--lp-line);
	background: var(--lp-card);
	transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease,
		background 0.3s ease;
}
.lp-card:hover {
	transform: translateY(-4px);
	border-color: rgba(34, 211, 238, 0.45);
	background: rgba(255, 255, 255, 0.055);
	box-shadow: 0 30px 64px -38px rgba(34, 211, 238, 0.9);
}
.lp-card-icon {
	display: grid;
	place-items: center;
	width: 46px;
	height: 46px;
	border-radius: 14px;
	color: #05060e;
	background: linear-gradient(135deg, var(--lp-violet), var(--lp-cyan));
	box-shadow: 0 12px 30px -14px rgba(124, 108, 255, 0.9);
}
.lp-icon {
	width: 22px;
	height: 22px;
}
.lp-card-title {
	margin: 18px 0 0;
	font-size: 1.02rem;
	font-weight: 680;
}
.lp-card-text {
	margin: 10px 0 0;
	font-size: 13.8px;
	line-height: 1.65;
	color: var(--lp-muted);
}

/* Pasos ------------------------------------------------------------ */
.lp-steps {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 20px;
	margin: 40px 0 0;
	padding: 0;
	list-style: none;
}
.lp-step {
	position: relative;
	padding: 26px 22px;
	border-radius: 18px;
	border: 1px solid var(--lp-line);
	background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.01));
}
.lp-step-num {
	font-family: var(--font-mono, ui-monospace, monospace);
	font-size: 1.5rem;
	font-weight: 750;
	background: linear-gradient(135deg, #a78bfa, #22d3ee);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}
.lp-step-title {
	margin: 14px 0 0;
	font-size: 1rem;
	font-weight: 650;
}
.lp-step-text {
	margin: 9px 0 0;
	font-size: 13.5px;
	line-height: 1.6;
	color: var(--lp-muted);
}

/* CTA final -------------------------------------------------------- */
.lp-final {
	padding-top: 100px;
	padding-bottom: 100px;
}
.lp-final-panel {
	position: relative;
	overflow: hidden;
	padding: 64px 40px;
	border-radius: 28px;
	border: 1px solid rgba(124, 108, 255, 0.35);
	text-align: center;
	background:
		radial-gradient(700px 300px at 50% -30%, rgba(124, 108, 255, 0.35), transparent 70%),
		linear-gradient(180deg, rgba(20, 22, 46, 0.9), rgba(8, 9, 22, 0.95));
	box-shadow: 0 60px 130px -60px rgba(124, 108, 255, 0.9);
}
.lp-final-glow {
	position: absolute;
	width: 520px;
	height: 520px;
	bottom: -320px;
	left: 50%;
	transform: translateX(-50%);
	border-radius: 50%;
	background: radial-gradient(circle, rgba(34, 211, 238, 0.35), transparent 70%);
	filter: blur(40px);
	pointer-events: none;
}
.lp-final-title {
	position: relative;
	margin: 14px 0 0;
	font-size: clamp(1.8rem, 4vw, 2.8rem);
	font-weight: 800;
	letter-spacing: -0.02em;
}
.lp-final-sub {
	position: relative;
	margin-left: auto;
	margin-right: auto;
}
.lp-final .lp-cta {
	position: relative;
}
.lp-final .lp-eyebrow {
	position: relative;
}

/* Pie -------------------------------------------------------------- */
.lp-footer {
	margin-top: 40px;
	border-top: 1px solid var(--lp-line);
	background: rgba(4, 5, 12, 0.6);
}
.lp-footer-inner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 22px;
	padding-top: 40px;
	padding-bottom: 28px;
}
.lp-footer-brand {
	display: flex;
	align-items: center;
	gap: 13px;
}
.lp-footer-name {
	margin: 0;
	font-size: 14px;
	font-weight: 650;
}
.lp-footer-note {
	margin: 3px 0 0;
	font-size: 12.5px;
	color: var(--lp-muted);
}
.lp-footer-links {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 20px;
}
.lp-footer-links a {
	font-size: 13.5px;
	color: var(--lp-muted);
	text-decoration: none;
	transition: color 0.2s ease;
}
.lp-footer-links a:hover {
	color: var(--lp-text);
}
.lp-footer-legal {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
	padding-bottom: 34px;
	font-size: 12.5px;
	color: #6c74a0;
}
.lp-footer-dot {
	color: #3b4166;
}

/* Animaciones ------------------------------------------------------ */
@keyframes lp-float {
	0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
	50% { transform: translate3d(30px, 40px, 0) scale(1.08); }
}
@keyframes lp-pulse {
	0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.55); }
	70% { box-shadow: 0 0 0 9px rgba(52, 211, 153, 0); }
	100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
}
@keyframes lp-shimmer {
	to { background-position: 220% center; }
}
@keyframes lp-grow {
	from { transform: scaleX(0); }
	to { transform: scaleX(1); }
}
@keyframes lp-up {
	from { opacity: 0; transform: translateY(18px); }
	to { opacity: 1; transform: translateY(0); }
}
.lp-up {
	animation: lp-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Responsive ------------------------------------------------------- */
@media (max-width: 1024px) {
	.lp-nav-links { display: none; }
	.lp-nav-actions { display: none; }
	.lp-menu { display: block; }
	.lp-window-body { grid-template-columns: 1fr; }
	.lp-side { display: none; }
	.lp-metrics { grid-template-columns: repeat(2, 1fr); }
	.lp-modes { grid-template-columns: 1fr; }
	.lp-grid { grid-template-columns: repeat(2, 1fr); }
	.lp-steps { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
	.lp-hero { padding: 64px 0 48px; }
	.lp-metrics { grid-template-columns: 1fr; }
	.lp-grid { grid-template-columns: 1fr; }
	.lp-steps { grid-template-columns: 1fr; }
	.lp-section { padding: 68px 20px 0; }
	.lp-final-panel { padding: 48px 22px; }
	.lp-cta .lp-btn { width: 100%; }
	.lp-row { grid-template-columns: 30px 1fr 54px; }
	.lp-track { display: none; }
}

@media (prefers-reduced-motion: reduce) {
	.lp-root *,
	.lp-root *::before,
	.lp-root *::after {
		animation-duration: 0.001ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.001ms !important;
	}
}
`;
