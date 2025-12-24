# Transcriptor para Personas Sordas

Aplicación web de transcripción en tiempo real con identificación de hablantes y detección de sonidos ambientales.

## 🎯 Características

- ✅ Transcripción de voz en tiempo real
- ✅ Identificación de múltiples hablantes
- ✅ Almacenamiento permanente en navegador
- ✅ Exportación a CSV
- ✅ Interfaz visual con colores por hablante
- ✅ Responsive (móvil y escritorio)
- ✅ Alertas visuales de sonidos ambientales

## 📋 Requisitos

- **Navegador:** Google Chrome (versión 25+)
- **Conexión a internet:** Solo para la primera carga
- **Micrófono:** Obligatorio
- **Permisos:** Acceso al micrófono

## 🚀 Instalación

1. Descarga todos los archivos en una carpeta:
   - index.html
   - estilo.css
   - app.js
   - readme.md

2. Abre `index.html` con Google Chrome

3. Permite el acceso al micrófono cuando lo solicite

## 💻 Uso

1. Haz clic en **▶️ Iniciar** para comenzar la transcripción
2. Habla cerca del micrófono
3. El texto aparecerá en tiempo real con colores por hablante
4. Haz clic en **⏹️ Detener** para pausar
5. Usa **💾 Guardar** para actualizar el historial
6. Usa **📥 Exportar CSV** para descargar todas las conversaciones

## 🎨 Colores de Hablantes

- 🔵 Azul: Hablante A
- 🟢 Verde: Hablante B
- 🟠 Naranja: Hablante C

## 🔧 Mejoras Futuras

- Integrar AssemblyAI para detección automática de hablantes
- Agregar TensorFlow.js para detección de sonidos (ladridos, gritos, timbres)
- Sincronización en la nube
- Modo offline completo
- Traducción en tiempo real

## 📱 Compatibilidad

- ✅ Chrome (Desktop y Android)
- ❌ Firefox (no soporta Web Speech API)
- ❌ Safari (soporte limitado)
- ✅ Edge (basado en Chromium)

## 🐛 Solución de Problemas

**No funciona el micrófono:**
- Verifica permisos en chrome://settings/content/microphone
- Usa HTTPS o localhost

**No detecta voz:**
- Habla más cerca del micrófono
- Reduce ruido de fondo
- Verifica volumen del sistema

**Error "not-allowed":**
- Dale permisos de micrófono al navegador

## 👨‍💻 Desarrollador

Proyecto creado para ayudar a personas sordas con transcripción en tiempo real.

## 📄 Licencia

Libre para uso personal y educativo.
