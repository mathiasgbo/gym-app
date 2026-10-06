# Temple — material para Google Play Console

Paquete: `com.mgb.temple` · Pista: **Prueba interna** · Política de privacidad:
https://mathiasgbo.github.io/gym-app/privacypolicy.html

Archivos en esta carpeta: `icon-512.png` (ícono), `feature-graphic.png` (gráfico de funciones 1024×500).
Capturas de pantalla (6, con datos de ejemplo): `play/screenshots/`. No se suben a GitHub porque muestran el plan de alimentación.

---

## Ficha de Play Store

**Nombre de la app** (máx. 30): `Temple: rutina y progreso`

**Descripción breve** (máx. 80):
`Entreno, comidas, sueño y progreso en un solo lugar. Templá tu cuerpo.`

**Descripción completa:**

```
Temple junta todo lo que hace a tu progreso: entrenamiento, alimentación y descanso. Tu cuerpo es tu templo.

🏋️ ENTRENÁ CON UN PLAN
• Tu rutina organizada por días, con series, repeticiones y notas.
• Registrá peso y repeticiones de cada serie en segundos.
• Sugerencias de progresión automáticas: cuándo subir peso, mantener o bajar.
• Timer de descanso que vibra al terminar.
• Aviso de semana de descarga (deload) cuando la necesitás.
• Videos de técnica guardados en el teléfono para verlos sin señal.

🍽️ COMÉ SEGÚN TU PLAN
• Cargá tu plan de alimentación por porciones y marcá lo que comés en cada comida.
• Contador de agua con recordatorios y botón "Tomé un vaso" en la notificación.
• Horas de sueño automáticas desde Health Connect (Samsung Health, Zepp y otras apps).

📈 MIRÁ CÓMO PROGRESÁS
• Calendario con tus entrenos, cardio y comidas cumplidas.
• Gráficos por ejercicio y tendencia de cada levantamiento.
• Peso corporal e IMC a lo largo del tiempo.
• Importá tus informes de antropometría en PDF y compará masa muscular, grasa, perímetros y pliegues entre mediciones.

🔒 TUS DATOS SON TUYOS
Todo queda guardado en tu teléfono. Sin cuentas, sin publicidad, sin servidores. Podés exportar un backup cuando quieras.

Temple funciona sin conexión.
```

**Categoría:** Salud y bienestar · **Etiquetas:** Fitness, Entrenamiento, Nutrición
**Correo de contacto:** el de tu cuenta de desarrollador.

---

## Contenido de la app (Panel → "Configurar la app")

| Sección | Respuesta |
|---|---|
| Política de privacidad | https://mathiasgbo.github.io/gym-app/privacypolicy.html |
| Acceso a la app | Todas las funciones están disponibles sin restricciones (no hay login). |
| Anuncios | No contiene anuncios. |
| Clasificación de contenido | Categoría *Utilidad, productividad, comunicación u otra*. Responder **No** a todo (violencia, sexo, apuestas, interacción entre usuarios, compras, ubicación). |
| Público objetivo | 18 años o más. No está dirigida a niños. |
| Apps de noticias / gubernamentales / financieras | No. |
| Salud | Marcar: **Actividad física y fitness**, **Nutrición y control de peso**, **Sueño**. No es dispositivo médico. |

### Seguridad de los datos
- ¿Recopila o comparte datos del usuario? → **No.**
  Todo se procesa y guarda en el dispositivo; nada se transmite fuera del teléfono (según la definición de Google, el procesamiento solo local no cuenta como "recopilación").
- ¿Los datos se encriptan en tránsito? → No aplica (no hay transmisión).
- ¿Se pueden borrar? → Sí: desinstalando la app o borrando los datos desde Ajustes de Android.

### Permisos de Health Connect (declaración)
- Permiso: **Leer sueño** (`android.permission.health.READ_SLEEP`). Ningún otro.
- Justificación:
  > Temple muestra las horas dormidas cada noche junto con el registro de alimentación y entrenamiento del usuario, para que pueda relacionar su descanso con su progreso y con el objetivo de sueño de su plan (7-8 h). Solo lee la duración del sueño de la noche anterior; no escribe datos en Health Connect ni los envía fuera del dispositivo.
- Funcionalidad que lo usa: pantalla **Comida → Sueño** (se completa sola) y **Progreso → Últimos 7 días** (promedio de sueño).

---

## Pasos en Play Console

1. **Crear app** → nombre `Temple: rutina y progreso`, idioma español (Latinoamérica), App, Gratis.
2. Completar **Configurar la app** con las respuestas de arriba.
3. **Pruebas → Prueba interna → Testers:** crear una lista con tu mail de Google.
4. **Ficha de Play Store:** pegar los textos de arriba y subir ícono, gráfico de funciones y las 6 capturas.
5. **Crear versión** → aceptar **Firma de apps de Play** → subir `release/Temple.aab` → notas: "Primera versión".
6. Revisar y **lanzar** a prueba interna.
7. Abrir el **link de participación** desde el celu (con tu cuenta), aceptar e instalar desde Play Store.
