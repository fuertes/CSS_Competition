# Guía completa de despliegue de Next.js SSR en AWS EC2 (AWS Academy VocLabs)

Esta guía documenta el procedimiento paso a paso para desplegar una aplicación Next.js con Server-Side Rendering (SSR), Tailwind CSS v4, conexión a base de datos y gestión de procesos en una instancia EC2 dentro de AWS Academy VocLabs.

> **Importante:** sustituye la IP pública, el host de la base de datos y las credenciales de ejemplo por los valores reales de tu entorno. No compartas el archivo `.env.local` ni guardes secretos en el repositorio.

---

## 1. Requisitos del entorno EC2

- **Instancia EC2:** Ubuntu 22.04 LTS (`t3.micro` o `t3.small`).
- **Perfil IAM:** `LabInstanceProfile` (asociado a `LabRole`).
- **Dirección IP pública:** IPv4 asignada a la instancia; por ejemplo, `54.86.22.45`.
- **Grupo de seguridad (Security Group):**
  - Regla de entrada TCP personalizada en el puerto `3000`.
  - Regla de entrada SSH en el puerto `22`.
  - Por seguridad, limita el origen de las reglas a las direcciones IP que realmente necesiten acceder. Evita exponer SSH a `0.0.0.0/0`.

## 2. Paso 1: instalar Node.js 20 LTS

Next.js 16 o superior requiere Node.js `>=20.9.0`. Para preparar el entorno en Ubuntu:

```bash
# Registrar el repositorio de Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -

# Instalar Node.js y npm
sudo apt-get install -y nodejs

# Verificar la versión (debe ser compatible con el proyecto)
node -v
npm -v
```

## 3. Paso 2: configurar memoria de intercambio (SWAP)

En instancias con 1 GB de RAM (como una `t3.micro`), el compilador de Next.js puede necesitar memoria adicional. Un archivo Swap de 2 GB puede ayudar a evitar que el sistema operativo cancele la compilación por falta de memoria.

```bash
# Crear y activar un archivo Swap de 2 GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Confirmar la memoria Swap activa
free -h
```

Para intentar mantener la configuración tras reiniciar la instancia, añade una entrada a `/etc/fstab` solo si no existe ya:

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Paso 3: instalar pnpm

`pnpm` gestiona las dependencias del proyecto y puede ejecutar scripts de construcción necesarios para algunos paquetes nativos, incluido Tailwind CSS v4.

```bash
# Instalar pnpm globalmente
sudo npm install -g pnpm

# Verificar la instalación
pnpm -v
```

## 5. Paso 4: clonar el proyecto e instalar dependencias

```bash
# Acceder a la carpeta personal y clonar el repositorio
cd ~
git clone https://github.com/fuertes/CSS_Competition.git
cd CSS_Competition

# Revisar y aprobar los scripts de construcción si pnpm lo solicita
pnpm approve-builds

# Instalar las dependencias
pnpm install
```

Si el repositorio ya está clonado, entra en su directorio y actualízalo siguiendo el flujo de trabajo Git que utilice el proyecto, en lugar de volver a clonarlo.

## 6. Paso 5: configurar el archivo `.env.local`

El archivo `.env.local` no debe incluirse en el repositorio de Git. Debes crearlo manualmente en el servidor para definir la URL pública de la aplicación y la conexión con la base de datos.

### 6.1. Crear el archivo

Desde la raíz del repositorio:

```bash
cd ~/CSS_Competition
nano .env.local
```

### 6.2. Añadir la configuración

Adapta las variables a las que realmente utiliza el proyecto. Sustituye la IP de ejemplo y los datos de conexión por los valores reales.

```dotenv
# URL base de la aplicación
NEXTAUTH_URL="http://54.86.22.45:3000"
NEXT_PUBLIC_APP_URL="http://54.86.22.45:3000"

# Conexión a la base de datos PostgreSQL
DATABASE_URL="postgresql://usuario:contraseña@host-de-tu-db:5432/nombre_bd"

# Parámetros individuales, si el proyecto los utiliza
PGHOST="host-de-tu-db"
PGUSER="tu_usuario"
PGPASSWORD="tu_password"
PGDATABASE="nombre_bd"
PGPORT="5432"
```

**Notas importantes:**

- Si la aplicación no utiliza NextAuth, puede que `NEXTAUTH_URL` no sea necesaria.
- Define solo las variables que el código del proyecto utiliza; los nombres de las variables deben coincidir exactamente con los esperados por la aplicación.
- Si la base de datos está en la misma instancia, el host podría ser `localhost`; si está en otro servicio o servidor, utiliza su host real y comprueba las reglas de red.
- Codifica correctamente en URL los caracteres especiales que aparezcan en la contraseña de `DATABASE_URL`.
- `NEXT_PUBLIC_*` se expone al navegador en aplicaciones Next.js. No pongas secretos en variables con ese prefijo.
- Si utilizas HTTP, las credenciales y los datos no estarán cifrados en tránsito. Para un servicio público, configura HTTPS mediante un proxy inverso y un certificado TLS.

### 6.3. Guardar el archivo en nano

1. Pulsa `Ctrl + O`.
2. Pulsa `Enter` para confirmar el nombre.
3. Pulsa `Ctrl + X` para salir.

Comprueba que `.env.local` está excluido de Git:

```bash
git check-ignore .env.local
```

Si el comando no muestra el archivo como ignorado, revisa `.gitignore` y añade `.env.local` antes de continuar.

## 7. Paso 6: compilar el proyecto para producción

Desde la raíz del proyecto:

```bash
cd ~/CSS_Competition
pnpm run build
```

La compilación debe finalizar correctamente. Next.js suele mostrar una tabla de rutas estáticas y dinámicas; el formato exacto depende de la versión y de la configuración del proyecto.

Si la compilación falla por falta de memoria, revisa la salida de error, la memoria disponible y la configuración de Swap.

## 8. Paso 7: desplegar el servidor con PM2

### 8.1. Instalar PM2

```bash
sudo npm install -g pm2
```

### 8.2. Limpiar procesos anteriores (opcional)

**Precaución:** `pm2 delete all` elimina todos los procesos administrados por PM2 para el usuario actual. Ejecútalo solo si sabes que no hay otros servicios que quieras mantener.

```bash
pm2 delete all
```

### 8.3. Iniciar la aplicación

```bash
cd ~/CSS_Competition
HOSTNAME=0.0.0.0 PORT=3000 pm2 start pnpm --name "nextjs-app" -- start
```

La aplicación debe escuchar en el puerto `3000` y en todas las interfaces de red. Asegúrate de que el comando `start` del `package.json` ejecuta el servidor de producción de Next.js.

### 8.4. Comprobar los registros y el estado

```bash
pm2 flush
pm2 status
pm2 logs nextjs-app --lines 10
```

En los registros deberías ver un mensaje de inicio correcto, por ejemplo `Ready`. La dirección privada que aparece en los registros puede ser distinta de la IP pública. Para acceder desde el navegador, utiliza la IP pública de la instancia y el puerto `3000`, siempre que el grupo de seguridad lo permita:

```text
http://54.86.22.45:3000
```

Sustituye esa IP por la dirección pública real de tu instancia.

## 9. Paso 8: recuperar el servicio tras detener o reiniciar EC2

Si la instancia se detiene (`Stop`) o se reinicia (`Reboot`), es posible que el proceso no vuelva a arrancar automáticamente si PM2 no está configurado para iniciarse con el sistema.

### Opción A: iniciar manualmente

Conéctate por SSH a la instancia y ejecuta:

```bash
cd ~/CSS_Competition
HOSTNAME=0.0.0.0 PORT=3000 pm2 start pnpm --name "nextjs-app" -- start
```

Si el proceso ya existe en PM2, utiliza en su lugar:

```bash
pm2 restart nextjs-app
```

### Opción B: configurar el inicio automático con el sistema operativo (recomendado)

Ejecuta estos pasos una sola vez con el usuario que administra la aplicación (en Ubuntu suele ser `ubuntu`):

1. Inicia la aplicación y verifica que funciona.
2. Guarda la lista de procesos administrados por PM2:

   ```bash
   pm2 save
   ```

3. Genera la configuración de inicio automático:

   ```bash
   sudo env PATH=$PATH:/usr/bin /usr/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
   ```

4. Si el comando muestra otra instrucción `sudo` para copiar y ejecutar, ejecútala tal como aparece.
5. Vuelve a guardar la lista de procesos después de confirmar que `nextjs-app` está activo:

   ```bash
   pm2 save
   ```

6. Comprueba el estado:

   ```bash
   pm2 status
   ```

La configuración de inicio automático depende del usuario de Linux. Administra la aplicación y ejecuta `pm2 save` con el mismo usuario configurado en el servicio de systemd.

## 10. Comandos útiles de administración

| Acción | Comando |
|---|---|
| Ver el estado de la aplicación | `pm2 status` |
| Ver registros en tiempo real | `pm2 logs nextjs-app` |
| Ver las últimas 10 líneas de registros | `pm2 logs nextjs-app --lines 10` |
| Limpiar los registros actuales | `pm2 flush` |
| Reiniciar la aplicación | `pm2 restart nextjs-app` |
| Detener el servicio | `pm2 stop nextjs-app` |
| Volver a iniciar un proceso detenido | `pm2 start nextjs-app` |
| Guardar la lista de procesos para el arranque automático | `pm2 save` |
| Reconstruir tras cambios de código o configuración | `pnpm run build && pm2 restart nextjs-app` |

> **Nota sobre cambios de entorno:** Next.js puede leer algunas variables durante la compilación y otras al arrancar. Si cambias `.env.local`, vuelve a compilar cuando la variable afecte a la compilación y reinicia el proceso. Si el comportamiento no cambia, revisa qué variables lee el proyecto y cuándo las consume.

---

## 11. Lista de comprobación final

- [ ] Node.js y pnpm están instalados.
- [ ] El repositorio está clonado y las dependencias instaladas.
- [ ] `.env.local` existe en la raíz del proyecto y contiene los valores correctos.
- [ ] `.env.local` está excluido de Git.
- [ ] `pnpm run build` termina correctamente.
- [ ] PM2 muestra `nextjs-app` como activo.
- [ ] La aplicación responde desde el navegador mediante la IP pública y el puerto configurado.
- [ ] El grupo de seguridad permite únicamente el tráfico necesario.
- [ ] PM2 tiene configurado el inicio automático y se ha ejecutado `pm2 save`.

