# click.1986 — Task Manager

Gestor de tareas personal con soporte PWA (instalable como app).

## Despliegue en GitHub Pages

1. Crear repositorio en GitHub llamado `click1986`
2. Subir todos estos archivos al repo
3. Ir a Settings → Pages → Source: `main` branch → `/root`
4. La app queda en: `https://luisybarra86-bot.github.io/click1986/`

## Instalar como app en PC

1. Abrir la URL en Chrome o Edge
2. En la barra de direcciones aparece un ícono de instalar (⊕) o un botón "Instalar app"
3. Hacer clic → "Instalar"
4. La app aparece en el menú inicio y se abre en ventana propia

## Datos

Los datos (espacios y tareas) se guardan en Supabase (tablas `spaces` y `tasks`).
Las preferencias de la interfaz (tema, densidad, nombre, Telegram) quedan en `localStorage` del navegador.

## Respaldo

En la app: sidebar → "Exportar backup" (o Configuración → Datos → Exportar).
Descarga un JSON con todos los espacios y tareas. Para restaurar, usar "Importar backup".
