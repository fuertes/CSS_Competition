import Card from '@/components/ui/Card';
import { getDatabaseConfig } from '@/lib/config';

/**
 * Aviso de configuración pendiente. Es un componente de servidor porque lee la
 * configuración del servidor (`DATABASE_URL`), que nunca debe llegar al
 * navegador.
 */
export default function ConfigNotice() {
	const config = getDatabaseConfig();

	return (
		<Card title="Configuración pendiente" className="mx-auto max-w-2xl">
			<div className="space-y-4 text-sm text-slate-600">
				<p>
					La aplicación todavía <strong>no está conectada a PostgreSQL (Docker)</strong>. No se muestran datos
					simulados: hasta completar la configuración, las funciones de competición permanecen
					desactivadas.
				</p>
				{config.reason && (
					<p className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">{config.reason}</p>
				)}
				<ol className="list-decimal space-y-2 pl-5">
					<li>
						Levanta la base de datos local:
						<code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">npm run db:up</code>.
					</li>
					<li>
						Copia <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">.env.example</code> a
						<code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">.env</code> y rellena
						<code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">DATABASE_URL</code> y
						<code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">POSTGRES_PASSWORD</code>.
					</li>
					<li>
						Aplica las migraciones:
						<code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">npm run db:migrate</code>.
					</li>
					<li>
						Crea el administrador:
						<code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">npm run db:seed-admin</code>.
					</li>
					<li>Reinicia el servidor de desarrollo.</li>
				</ol>
				<p className="text-xs text-slate-500">
					Todos los pasos están detallados en el <strong>README.md</strong> del proyecto.
				</p>
			</div>
		</Card>
	);
}
