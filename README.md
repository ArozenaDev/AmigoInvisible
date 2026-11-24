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
- PostgreSQL para la persistencia en producción.
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
Las pruebas contra una instancia PostgreSQL externa son opcionales y se omiten
si no se configuran sus variables de conexión de pruebas.

## Datos locales

Durante el desarrollo, la aplicación mantiene sus datos en un directorio local
ignorado por Git. Eliminar esos datos reinicia familias, sorteos y sesiones del
entorno local; no lo hagas si necesitas conservar tus pruebas.

## Producción

En el despliegue SSR, las familias, participantes, ediciones y sesiones se
almacenan en PostgreSQL. Las escrituras relacionadas se confirman mediante una
transacción; las consultas públicas devuelven exclusivamente los datos
autorizados por el servidor. La implementación actual serializa las operaciones
de estado mediante un bloqueo de transacción, priorizando integridad sobre
concurrencia elevada.

Configura `DATABASE_URL` con una cadena PostgreSQL privada y cifrada, además de
`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` y `SESSION_SECRET`, como secretos del
entorno del servidor. Nunca los incluyas en el repositorio o en el navegador.
Utiliza bases de datos distintas para producción y previsualizaciones. Las
migraciones son manuales (`npm run db:migrate` con `DATABASE_URL` configurada)
y no se ejecutan automáticamente al desplegar. Verifica copias de seguridad y
restauración antes de usar datos reales.

Para probar la concurrencia contra una **base de pruebas independiente**, se
puede ejecutar la suite con `TEST_DATABASE_URL` configurada. Esa prueba crea y
elimina un esquema temporal; no debe apuntarse a la base de producción. Sin
esa variable, se omite y las pruebas PostgreSQL embebidas siguen ejecutándose.
La URL de esta prueba debe ser directa (sin pooler), ya que utiliza estado de
sesión de PostgreSQL. Para las peticiones normales de la aplicación se
recomienda una URL con pooler y TLS. La prueba integral opcional utiliza
`TEST_E2E_DATABASE_URL` y crea datos ficticios en la base indicada; debe
ejecutarse exclusivamente en una rama de pruebas aislada.

## Contribución

No incluyas datos reales de participantes, familias, regalos, contraseñas,
PIN, sesiones ni copias de seguridad en commits, ejemplos o capturas públicas.
