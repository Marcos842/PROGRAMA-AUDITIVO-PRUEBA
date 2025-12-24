// Variables globales
let recognition;
let isRecording = false;
let db = {
    conversaciones: []
};
let resultadoProcesado = 0;

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', function() {
    inicializarReconocimiento();
    cargarHistorial();
    configurarBotones();
});

// Configurar reconocimiento de voz
function inicializarReconocimiento() {
    // Verificar soporte del navegador
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        
        // Configuración
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-PE';
        recognition.maxAlternatives = 1;
        
        // Evento cuando hay resultados
        recognition.onresult = manejarResultados;
        
        // Evento cuando termina
        recognition.onend = function() {
            if (isRecording) {
                recognition.start();
                resultadoProcesado = 0;
            }
        };
        
        // Evento cuando inicia
        recognition.onstart = function() {
            resultadoProcesado = 0;
        };
        
        // Evento de error
        recognition.onerror = function(event) {
            console.error('Error de reconocimiento:', event.error);
            mostrarAlerta('Error: ' + event.error, 'error');
        };
        
        console.log('Reconocimiento de voz inicializado correctamente');
    } else {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Google Chrome.');
    }
}

// Manejar resultados de transcripción
function manejarResultados(event) {
    let textoTemporal = '';
    
    // Solo procesar resultados NUEVOS
    for (let i = resultadoProcesado; i < event.results.length; i++) {
        const texto = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
            // Este resultado es final, guardarlo
            const hablante = detectarHablante();
            agregarTexto(texto, hablante, true);
            resultadoProcesado = i + 1;
        } else {
            // Mostrar temporalmente mientras habla
            textoTemporal += texto;
        }
    }
    
    // Mostrar texto temporal
    if (textoTemporal) {
        document.getElementById('texto-temporal').innerHTML = 
            `<span class="temporal">Escuchando: ${textoTemporal}</span>`;
    } else {
        document.getElementById('texto-temporal').innerHTML = '';
    }
}

// Agregar texto a la pantalla
function agregarTexto(texto, hablante, guardar = false) {
    const ahora = new Date();
    const tiempo = ahora.toLocaleTimeString();
    
    const divTexto = document.createElement('div');
    divTexto.className = `hablante hablante-${hablante}`;
    divTexto.innerHTML = `
        <span class="tiempo">[${tiempo}]</span>
        <strong>Hablante ${hablante.toUpperCase()}:</strong> ${texto}
    `;
    
    document.getElementById('texto-final').appendChild(divTexto);
    
    // Auto-scroll hacia abajo
    divTexto.scrollIntoView({ behavior: 'smooth' });
    
    if (guardar) {
        guardarTranscripcion(texto, hablante, tiempo);
    }
}

// Detectar hablante (simplificado)
let ultimoHablante = 'a';
function detectarHablante() {
    // Alternar entre hablantes
    // En producción usarías AssemblyAI para detectar automáticamente
    ultimoHablante = ultimoHablante === 'a' ? 'b' : 'a';
    return ultimoHablante;
}

// Guardar transcripción en localStorage
function guardarTranscripcion(texto, hablante, tiempo) {
    const registro = {
        id: Date.now(),
        fecha: new Date().toISOString(),
        hora: tiempo,
        hablante: hablante,
        texto: texto
    };
    
    db.conversaciones.push(registro);
    localStorage.setItem('transcripciones', JSON.stringify(db.conversaciones));
}

// Cargar historial del localStorage
function cargarHistorial() {
    const guardado = localStorage.getItem('transcripciones');
    if (guardado) {
        db.conversaciones = JSON.parse(guardado);
        mostrarHistorial();
    }
}

// Mostrar historial en pantalla
function mostrarHistorial() {
    const lista = document.getElementById('lista-conversaciones');
    lista.innerHTML = '';
    
    if (db.conversaciones.length === 0) {
        lista.innerHTML = '<p style="color: #999; text-align: center;">No hay conversaciones guardadas</p>';
        return;
    }
    
    // Mostrar últimas 10 conversaciones
    const ultimas = db.conversaciones.slice(-10).reverse();
    
    ultimas.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversacion-item';
        item.innerHTML = `
            <div class="fecha">${new Date(conv.fecha).toLocaleDateString()} - ${conv.hora}</div>
            <strong>Hablante ${conv.hablante.toUpperCase()}:</strong> ${conv.texto}
        `;
        lista.appendChild(item);
    });
}

// Limpiar conversación de la pantalla
function limpiarConversacion() {
    document.getElementById('texto-final').innerHTML = '';
    document.getElementById('texto-temporal').innerHTML = '';
    resultadoProcesado = 0;
    mostrarAlerta('Conversación limpiada', 'success');
}

// NUEVA FUNCIÓN: Borrar todo el historial guardado
function borrarHistorial() {
    if (confirm('¿Estás seguro de borrar TODO el historial guardado? Esta acción no se puede deshacer.')) {
        db.conversaciones = [];
        localStorage.removeItem('transcripciones');
        mostrarHistorial();
        mostrarAlerta('Historial eliminado completamente', 'success');
    }
}

// Exportar a CSV
function exportarCSV() {
    if (db.conversaciones.length === 0) {
        alert('No hay conversaciones para exportar');
        return;
    }
    
    let csv = 'Fecha,Hora,Hablante,Texto\n';
    
    db.conversaciones.forEach(conv => {
        const fecha = new Date(conv.fecha).toLocaleDateString();
        csv += `${fecha},${conv.hora},${conv.hablante},"${conv.texto}"\n`;
    });
    
    // Crear y descargar archivo
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcripciones_${Date.now()}.csv`;
    link.click();
    
    mostrarAlerta('Archivo CSV descargado exitosamente', 'success');
}

// Mostrar alertas
function mostrarAlerta(mensaje, tipo) {
    const alerta = document.getElementById('alertas-sonido');
    alerta.textContent = mensaje;
    alerta.style.display = 'block';
    alerta.style.background = tipo === 'error' ? '#ff4444' : '#4CAF50';
    
    setTimeout(() => {
        alerta.style.display = 'none';
    }, 3000);
}

// Configurar eventos de botones
function configurarBotones() {
    // Botón Iniciar
    document.getElementById('iniciar').addEventListener('click', function() {
        if (!isRecording) {
            // Limpiar transcripción anterior
            document.getElementById('texto-final').innerHTML = '';
            document.getElementById('texto-temporal').innerHTML = '';
            resultadoProcesado = 0;
            
            recognition.start();
            isRecording = true;
            this.textContent = '🎤 Grabando...';
            this.style.background = '#4CAF50';
            mostrarAlerta('Transcripción iniciada', 'success');
        }
    });
    
    // Botón Detener
    document.getElementById('detener').addEventListener('click', function() {
        if (isRecording) {
            recognition.stop();
            isRecording = false;
            resultadoProcesado = 0;
            document.getElementById('iniciar').textContent = '▶️ Iniciar';
            document.getElementById('iniciar').style.background = '#2196F3';
            document.getElementById('texto-temporal').innerHTML = '';
            mostrarAlerta('Transcripción detenida', 'success');
        }
    });
    
    // Botón Limpiar
    document.getElementById('limpiar').addEventListener('click', function() {
        if (confirm('¿Estás seguro de limpiar toda la conversación visible?')) {
            limpiarConversacion();
        }
    });
    
    // Botón Guardar
    document.getElementById('guardar').addEventListener('click', function() {
        mostrarHistorial();
        mostrarAlerta('Historial actualizado', 'success');
    });
    
    // Botón Exportar
    document.getElementById('exportar').addEventListener('click', function() {
        exportarCSV();
    });
    
    // Botón Borrar Historial (NUEVO)
    document.getElementById('borrar-historial').addEventListener('click', function() {
        borrarHistorial();
    });
}
