# Respaldo manual antes de la migración

Antes de que la Fase 3 (migración de boletas a nodos individuales en Firebase)
toque cualquier dato real, haz estos dos respaldos. Son independientes entre sí
— haz ambos.

## 1. Exportar desde la app

1. Abre la app en el navegador con tu usuario dueño.
2. Toca el menú **"⋮"** (arriba a la derecha, junto al botón de sincronización).
3. Toca **"Exportar"**.
4. Se descarga un archivo `evento_YYYY-MM-DD.json` con peleadores, peleas,
   gastos y boletas (v3). Guárdalo en un lugar seguro (no solo en Descargas).

## 2. Exportar la base de datos completa desde Firebase

1. Entra a [console.firebase.google.com](https://console.firebase.google.com)
   con tu cuenta.
2. Selecciona el proyecto **velada-sangre-nueva-22fb0**.
3. Ve a **Realtime Database** (menú de la izquierda).
4. Arriba a la derecha, toca el menú **"⋮"** de la base de datos.
5. Toca **"Export JSON"** (o "Exportar JSON").
6. Se descarga un archivo con **todo** el contenido de `sangre_nueva/` tal
   como está en este momento. Guárdalo junto con el archivo anterior.

## Cuándo hacerlo

Haz ambos respaldos **justo antes** de avisarme que puedes continuar con la
Fase 3. Si pasan varias horas o hay ventas nuevas entre el respaldo y la
migración, repite el paso 2 (el de Firebase) para tener la copia más reciente.

Después de hacer los dos, dime "ya hice los dos respaldos" y sigo con la
Fase 3.
