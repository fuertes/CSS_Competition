# Despliegue en AWS Amplify Hosting (SSR de Next.js)

Guía para desplegar `css-competition` (Next.js 16, App Router, SSR) en **AWS
Amplify Hosting** con una base de datos **Amazon RDS for PostgreSQL**.

> **Nota de compatibilidad (leer primero).** El adaptador SSR gestionado de
> Amplify Hosting tiene soporte oficial certificado para versiones concretas de
> Next.js. **Antes de empezar, comprueba en la documentación de AWS que la
> versión instalada (`next@16.4.0`) está soportada** por el adaptador de
> Amplify; si aún no lo está, usa el **plan B** de la sección 10 (contenedor
> con `output: 'standalone'`). Esta guía no afirma que Amplify soporte
> Next.js 16; esa verificación es un paso previo obligatorio.

---

## 1. Arquitectura del despliegue

```
Navegador ──HTTPS──> AWS Amplify Hosting (SSR Next.js, runtime Node 22)
                         │  (cómputo gestionado, salida a Internet)
                         │  DATABASE_URL (TLS obligatorio)
                         ▼
                   Amazon RDS for PostgreSQL (subred privada)
```

- El **navegador nunca** habla con RDS: todas las consultas pasan por el
  servidor Next (Route Handlers y Server Components).
- `DATABASE_URL` y `ACCESS_CODE_ENC_KEY` viven **solo** en las variables de
  entorno de Amplify (servidor). No se marcan como `NEXT_PUBLIC_*`.

---

## 2. Requisitos previos

- Cuenta AWS con permisos de Amplify, RDS, IAM y (opcional) Route 53.
- Repositorio Git (GitHub / GitLab / Bitbucket / CodeCommit) con el proyecto.
- **Node.js 22** en la build (Amplify permite fijar la versión con `nvm`).
- Una instancia **RDS PostgreSQL** creada y accesible.

---

## 3. Preparar la base de datos (RDS)

1. Crea una instancia **RDS for PostgreSQL** (versión 17 recomendada, la misma
   que usa `docker-compose.yml` en local).
2. Crea la base de datos `aula_competicion` y un usuario de aplicación
   (`aula_app`) con contraseña robusta.
3. **TLS obligatorio.** Amplify se conecta por TLS; la `DATABASE_URL` debe
   incluir `sslmode=require` (o `verify-full` con el certificado raíz de RDS).
   Para `verify-full`, descarga el bundle `global-bundle.pem` de RDS y
   configúralo mediante `sslrootcert` (o `PGSSLROOTCERT`). **No** desactives la
   verificación TLS en producción (`NODE_TLS_REJECT_UNAUTHORIZED=0` está
   prohibido).
4. **Conectividad.** El cómputo de Amplify sale a Internet desde direcciones
   gestionadas (no fijas). Opciones:
   - RDS **públicamente accesible** con el grupo de seguridad limitado a los
     rangos de salida, o
   - RDS en subred privada + **RDS Proxy** o **NAT Gateway** con IP elástica, y
     el grupo de seguridad de RDS abriendo el puerto 5432 a esa IP. Esta es la
     opción recomendada.
5. Aplica las **migraciones** (una vez, desde un entorno con acceso a RDS y con
   `DATABASE_URL` definida):

   ```bash
   npm ci
   npm run db:migrate      # aplica database/migrations/*.sql (idempotente)
   npm run db:check        # verifica conexión, tablas, funciones y triggers
   npm run db:seed-admin   # crea el primer administrador
   ```

   Las migraciones se aplican **dentro de una transacción** y con
   `pg_advisory_lock`; son seguras de reejecutar. **Nunca** ejecutes pasos
   destructivos sobre datos reales.

---

## 4. Variables de entorno en Amplify

En **Amplify → App settings → Environment variables** define:

| Variable | Ejemplo / valor | Notas |
| -------- | --------------- | ----- |
| `DATABASE_URL` | `postgresql://aula_app:…@mi-rds.rds.amazonaws.com:5432/aula_competicion?sslmode=require` | **Secreto.** Solo servidor. TLS obligatorio |
| `ACCESS_CODE_ENC_KEY` | clave base64 de 32 bytes | **Secreto.** Solo servidor (cifrado AES-256-GCM de códigos de acceso) |
| `NEXT_PUBLIC_COMPETITION_NAME` | `Competición por equipos` | Público; se muestra en la interfaz |
| `ADMIN_EMAIL` | `docente@ejemplo.com` | Solo para `db:seed-admin` |
| `ADMIN_PASSWORD` | contraseña temporal | Solo para `db:seed-admin` |
| `ADMIN_NAME` | `Docente` | Opcional |

Genera la clave de cifrado:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

No guardes secretos en el repositorio. `.env*` está en `.gitignore` (salvo
`.env.example`, con valores no reales).

---

## 5. Configuración de build (`amplify.yml`)

Crea `amplify.yml` en la raíz del repositorio:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - nvm use 22
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

- `nvm use 22` fija Node 22 (el proyecto exige `>=22.12.0`).
- Amplify detecta Next.js y provisiona el cómputo SSR automáticamente (si el
  adaptador soporta la versión; ver nota inicial).
- La build **no** ejecuta migraciones: se aplican aparte (§3), para no acoplar
  el despliegue al esquema.

---

## 6. Despliegue paso a paso

1. **Amplify Console → New app → Host web app.**
2. Conecta el repositorio y la rama de despliegue.
3. Amplify detecta Next.js; deja la configuración de build que use `amplify.yml`
   (§5).
4. Añade las **variables de entorno** (§4) en la fase de build y en el runtime
   de SSR.
5. **Save and deploy.** Observa las fases *provision → build → deploy →
   verify*.
6. Al terminar, Amplify entrega un dominio `https://<rama>.<id>.amplifyapp.com`.

---

## 7. Seguridad de red e IAM

- **RDS:** grupo de seguridad con entrada solo desde la IP de salida del
  cómputo (NAT/RDS Proxy). Nunca `0.0.0.0/0`.
- **Cifrado en tránsito:** `sslmode=require` (o `verify-full`).
- **Cifrado en reposo:** activa el cifrado del almacenamiento de RDS.
- **IAM de mínimo privilegio:** Amplify necesita permisos de despliegue, no de
  escritura arbitraria en RDS. El acceso a datos es exclusivamente por
  credenciales `DATABASE_URL`.
- **Secretos:** usa variables de entorno de Amplify (cifradas). Rota
  `ACCESS_CODE_ENC_KEY` con cuidado: los códigos cifrados con la clave anterior
  dejan de poder mostrarse (el acceso sigue funcionando por hash y lookup).

---

## 8. Dominio y HTTPS

1. **App settings → Domain management → Add domain.**
2. Si el dominio está en Route 53, Amplify crea los registros DNS y el
   certificado ACM automáticamente.
3. Fuerza HTTPS; las cookies de sesión ya usan `Secure` en producción.
4. Opcional: *Rewrites and redirects* para servir `404` personalizados.

---

## 9. Verificación post-despliegue

```bash
# Páginas públicas (deben responder 200)
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/ranking
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/alumnos
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/competicion/entrar
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/login

# Panel sin sesión: 307 → /login
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://TU-DOMINIO/admin

# Endpoints protegidos sin sesión: 401 (o 503 si falta configuración)
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/api/ranking
```

Comprobaciones manuales:

- Inicia sesión en `/login` con el administrador creado y recorre el panel.
- Verifica que el ranking se actualiza (sondeo cada 5 s).
- Entra en `/competicion/entrar` con un código de acceso de grupo y realiza una
  entrega; confirma la puntuación y la idempotencia (reenviar no vuelve a
  puntuar).
- Confirma que **sin** `DATABASE_URL` la app muestra el aviso de configuración y
  no datos simulados.

---

## 10. Plan B si el adaptador de Amplify no soporta Next.js 16

Si el adaptador SSR gestionado todavía no soporta Next.js 16, usa
`output: 'standalone'` y un contenedor:

1. En `next.config.ts` añade:

   ```ts
   const nextConfig: NextConfig = {
     output: 'standalone',
     // …resto de la configuración…
   };
   ```

2. `npm run build` genera `.next/standalone`.
3. Empaqueta con un `Dockerfile` que arranque `node server.js` (puerto 3000) y
   despliega en **AWS App Runner** o **ECS Fargate** detrás de un ALB, con las
   mismas variables de entorno y el mismo esquema de red hacia RDS.
4. Sirve el dominio con ACM + CloudFront/ALB.

Ambas rutas cumplen el requisito de **SSR en AWS**; elige la que soporte la
versión de Next instalada.

---

## 11. Limitaciones y notas

- **Compatibilidad de versión:** verifícala antes de desplegar (§nota inicial).
  Es el único punto que depende de terceros y no puede confirmarse desde este
  repositorio.
- **Migraciones:** no se automatizan en la build; se ejecutan manualmente contra
  RDS con `npm run db:migrate` y requieren acceso de red a la base de datos.
- **Salida a Internet:** no hay IP de salida fija si usas el cómputo gestionado
  de Amplify sin NAT; usa NAT Gateway o RDS Proxy para restringir el grupo de
  seguridad.
- **Coste:** RDS, NAT/Proxy y el cómputo de Amplify generan coste; revísalo antes
  de producción.
