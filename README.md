# click.1986

Gestor de tareas personal con soporte PWA e integracion con Supabase.

## Estructura

- `index.html`: estructura principal de la app.
- `styles.css`: estilos de la interfaz.
- `app.js`: logica, render, sincronizacion y backups locales.
- `config.js`: configuracion local no sensible.
- `sw.js`: cache offline de la app.

## Despliegue en GitHub Pages

1. Crear un repositorio llamado `click1986`.
2. Subir estos archivos al repo.
3. Ir a `Settings -> Pages`.
4. Elegir `main` y la raiz del proyecto.

## Datos y respaldo

- La app sincroniza con Supabase.
- Si la nube falla, usa un respaldo local en `localStorage`.
- Tambien se puede exportar/importar un backup manual desde la app.

## Telegram seguro

Ya no hay token de Telegram en el frontend.

Para usar notificaciones:

1. Crear un webhook propio o una funcion serverless que reciba `{ "message": "..." }`.
2. Guardar la URL en `config.js`:

```js
window.CLICK1986_CONFIG = {
  telegramWebhook: 'https://tu-endpoint-seguro'
};
```

Tambien se puede configurar desde la consola del navegador:

```js
setTelegramWebhook('https://tu-endpoint-seguro');
```

Para borrarlo:

```js
clearTelegramWebhook();
```

Tambien se puede configurar desde la propia app:

1. Abrir `click1986`.
2. Tocar el boton de Telegram.
3. Pegar la URL del webhook.
4. La app la guarda en `localStorage` de ese navegador.
