# Sorteo del Amigo Invisible

Aplicación web privada para organizar sorteos del Amigo Invisible con familia y
amistades. Permite preparar ediciones anuales, aplicar incompatibilidades y
compartir los resultados sin crear cuentas ni solicitar correo electrónico,
teléfono u otros datos de contacto.

## Qué permite hacer

### Para participantes

- Acceder a la página privada de su familia con una contraseña compartida.
- Buscar su nombre entre los participantes de la edición activa.
- Confirmar su identidad con un PIN personal de cuatro dígitos.
- Consultar su destinatario mientras el sorteo esté activo.
- Ver ideas de regalo asociadas al destinatario y enlaces externos de afiliado
  cuando la familia los haya configurado.

### Para administración

- Gestionar varias familias o grupos independientes.
- Crear, editar, archivar y restaurar familias.
- Gestionar perfiles reutilizables de participantes, alias opcionales, PIN,
  incompatibilidades e ideas de regalo.
- Preparar una edición anual con participantes e incompatibilidades propias.
- Generar sorteos completos que evitan autoasignaciones e incompatibilidades.
- Reducir, cuando sea posible, repeticiones del año anterior.
- Administrar el ciclo de vida de cada edición:
  - **Inactiva:** se pueden modificar participantes e incompatibilidades.
  - **Activa:** los participantes pueden consultar su resultado con su PIN.
  - **Cerrada:** la edición finaliza y queda disponible en el histórico.
- Reactivar una edición cerrada por error sin modificar sus asignaciones.
- Consultar el histórico y revelar una asignación concreta solo bajo demanda.

## Privacidad y seguridad

- Solo se solicitan los datos necesarios para organizar el sorteo: nombre,
  alias opcional, incompatibilidades e ideas de regalo.
- La aplicación no usa los datos para publicidad, analítica, perfiles
  comerciales ni cesión a terceros.
- Las contraseñas y los PIN no se almacenan en texto plano; se guardan como
  hashes de un solo sentido.
- Las sesiones se controlan en el servidor mediante cookies `HttpOnly`.
- Los resultados no se incluyen en la página pública ni se entregan hasta
  validar la sesión familiar y el PIN del participante.
- Los datos de desarrollo se excluyen del control de versiones para evitar que
  participantes, sorteos o credenciales lleguen al repositorio.

> **Nota de transparencia:** el almacenamiento local de desarrollo no está
> cifrado en reposo. Antes de utilizar datos reales en producción debe
> configurarse persistencia privada, secretos de servidor y un procedimiento
> de copia y restauración verificado.

## Tecnología

- [Astro](https://astro.build/) con renderizado del lado del servidor.
- [Tailwind CSS](https://tailwindcss.com/) para la base de estilos.
- JSON privado para el desarrollo local.
- [Roboto](https://fonts.google.com/specimen/Roboto) como tipografía de la
  interfaz.

## Desarrollo local

### Requisitos

- Node.js `>= 22.23.4`
- npm

### Puesta en marcha

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Copia el ejemplo de entorno y define tus propios valores privados:

   ```bash
   cp .env.example .env
   ```

3. Inicia el entorno local:

   ```bash
   npm run dev
   ```

Las variables requeridas son:

| Variable | Finalidad |
| --- | --- |
| `ADMIN_USERNAME` | Usuario de la única cuenta administradora. |
| `ADMIN_PASSWORD_HASH` | Hash de la contraseña de administración. |
| `SESSION_SECRET` | Secreto de al menos 32 caracteres para las sesiones. |

Nunca subas `.env`, datos reales de familias ni contraseñas al repositorio.

## Pruebas

Ejecuta la suite automática con:

```bash
npm test
```

Las pruebas validan el motor de sorteos, las incompatibilidades globales y por
edición, los PIN, las migraciones del JSON local y las transiciones de estado.
Utilizan directorios temporales y no modifican datos personales de desarrollo.

## Datos locales

Durante el desarrollo, la aplicación mantiene sus datos en un directorio local
ignorado por Git. Eliminar esos datos reinicia familias, sorteos y sesiones del
entorno local; no lo hagas si necesitas conservar tus pruebas.

## Producción

La aplicación usa el adaptador SSR de Vercel y, al ejecutarse en Vercel,
guarda su estado en un único JSON de **Vercel Blob privado**. Las lecturas
sensibles evitan caché y las escrituras emplean ETag para no sobrescribir
cambios concurrentes. El JSON nunca se entrega directamente al navegador.

Configura `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` y `SESSION_SECRET` como
variables privadas del proyecto. Vercel Blob utiliza credenciales de corta
duración OIDC en producción; no copies el token de Blob al repositorio ni al
cliente. Antes de abrir el sitio al público configura también límites de
peticiones en la capa de seguridad de Vercel y un procedimiento externo,
cifrado y comprobado de copias de seguridad.

## Contribución

No incluyas datos reales de participantes, familias, regalos, contraseñas,
PIN, sesiones ni copias de seguridad en commits, ejemplos o capturas públicas.
