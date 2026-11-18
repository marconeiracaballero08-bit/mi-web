# mi-web

## Mi CRM (`/crm`)

Un CRM personal y ligero que funciona directamente en el navegador, sin instalar nada ni necesitar servidor.

### Qué incluye

- **Panel**: resumen con contactos, valor del pipeline, previsión ponderada, ventas ganadas este mes, tasa de éxito, próximas tareas y actividad reciente.
- **Contactos**: listado con búsqueda, filtros por estado (Lead, Prospecto, Cliente, Inactivo), ordenación y etiquetas. Cada contacto tiene ficha propia con historial de notas, llamadas, emails y reuniones, sus oportunidades y sus tareas.
- **Oportunidades**: tablero tipo kanban por etapas (Nuevo → Contactado → Propuesta → Negociación → Ganado / Perdido). Arrastra las tarjetas para cambiarlas de etapa. Al ganar una oportunidad, el contacto pasa automáticamente a «Cliente».
- **Tareas**: agrupadas en vencidas, hoy, próximos 7 días y más adelante, con prioridad y contacto asociado.
- **Búsqueda global** (atajo: tecla `/`), **modo claro/oscuro** y diseño adaptado al móvil.
- **Ajustes**: nombre del CRM, moneda, exportar/importar copia de seguridad (.json) y exportar contactos a Excel (.csv).

### Cómo usarlo

Abre `crm/index.html` en tu navegador (doble clic), o publícalo con GitHub Pages, Vercel o Netlify.

Para probarlo en local con un servidor:

```bash
cd crm
python3 -m http.server 8000
# abre http://localhost:8000
```

La primera vez verás **datos de ejemplo**; pulsa «Empezar desde cero» cuando quieras usar los tuyos.

### Dónde se guardan los datos

Los datos se guardan en el almacenamiento local de tu navegador (`localStorage`): son privados y no salen de tu equipo, pero tampoco se sincronizan entre dispositivos. Usa **Ajustes → Exportar copia** con regularidad y **Importar copia** para pasarlos a otro navegador. Si borras los datos de navegación del sitio, se pierden.

### Estructura

```
crm/
├── index.html   # estructura de la página
├── styles.css   # estilos (tema claro/oscuro, responsive)
└── app.js       # lógica: vistas, formularios, kanban, almacenamiento
```
